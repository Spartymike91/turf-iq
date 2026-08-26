"""
Renders a CONUS soil temperature map from NOAA's GFS model output and
uploads it to Supabase Storage for the Weather page's "Soil Temperature"
overlay. Runs on a schedule via .github/workflows/soil-temp.yml — this
can't run inside the Next.js app itself because it's deployed on Vercel's
Node.js runtime, and there's no maintained pure-JS GRIB2 decoder; pygrib
(which wraps ecCodes) needs a real Python environment.

Source: GFS 0.25-degree surface analysis, TSOIL at 0-0.1m below ground
(roughly the top 4 inches) — the same depth NOAA's own CPC soil
temperature station network reports at. GFS updates 4x/day (00/06/12/18
UTC); this script always fetches the most recently *available* cycle,
since a brand-new cycle isn't posted for a few hours after its nominal
time.
"""

import io
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pygrib
import requests
from PIL import Image

# Fixed CONUS-ish bounding box — kept in sync with SoilTempMap.tsx on the
# frontend, which hardcodes the same bounds for the Leaflet image overlay.
TOP_LAT, BOTTOM_LAT = 50.0, 24.0
LEFT_LON, RIGHT_LON = -125.0, -65.0

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "soil-temp"

COLOR_STOPS = [
    (20, (76, 0, 115)),
    (32, (49, 54, 149)),
    (45, (69, 117, 180)),
    (55, (116, 173, 209)),
    (65, (171, 217, 233)),
    (72, (255, 255, 191)),
    (80, (254, 224, 144)),
    (88, (253, 174, 97)),
    (95, (244, 109, 67)),
    (105, (215, 48, 39)),
    (115, (165, 0, 38)),
]


def colorize(t: float) -> tuple:
    if np.isnan(t):
        return (0, 0, 0)
    if t <= COLOR_STOPS[0][0]:
        return COLOR_STOPS[0][1]
    if t >= COLOR_STOPS[-1][0]:
        return COLOR_STOPS[-1][1]
    for (t0, c0), (t1, c1) in zip(COLOR_STOPS, COLOR_STOPS[1:]):
        if t0 <= t <= t1:
            f = (t - t0) / (t1 - t0)
            return tuple(int(c0[k] + f * (c1[k] - c0[k])) for k in range(3))
    return (0, 0, 0)


def candidate_cycles(now: datetime):
    """Most recent GFS cycles first, oldest last — try each until one exists.

    A cycle's 0.25-degree f000 file typically isn't posted until ~3.5-4
    hours after its nominal time, so the "latest" synoptic hour is often
    not actually available yet; we fall back through a few older ones.
    """
    hour = (now.hour // 6) * 6
    cycle = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    for _ in range(6):
        yield cycle
        cycle -= timedelta(hours=6)


def fetch_grib(cycle: datetime) -> Optional[bytes]:
    date_str = cycle.strftime("%Y%m%d")
    hour_str = cycle.strftime("%H")
    url = (
        "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
        f"?file=gfs.t{hour_str}z.pgrb2.0p25.f000"
        f"&dir=%2Fgfs.{date_str}%2F{hour_str}%2Fatmos"
        "&var_TSOIL=on&lev_0-0.1_m_below_ground=on"
        f"&subregion=&toplat={TOP_LAT}&leftlon={LEFT_LON}&rightlon={RIGHT_LON}&bottomlat={BOTTOM_LAT}"
    )
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200 or len(resp.content) < 1000:
        return None
    return resp.content


def render_png(grib_bytes: bytes) -> bytes:
    with open("/tmp/_soiltemp_fetch.grib2", "wb") as f:
        f.write(grib_bytes)
    grbs = pygrib.open("/tmp/_soiltemp_fetch.grib2")
    g = grbs[1]
    data, lats, lons = g.data()
    mask = np.ma.getmaskarray(data)
    temp_f = np.where(mask, np.nan, (data - 273.15) * 9 / 5 + 32)

    # Grid rows run south-to-north; flip so north is at the top of the image.
    temp_f = np.flipud(temp_f)
    mask = np.flipud(mask)

    h, w = temp_f.shape
    rgb = np.array([colorize(float(t)) for t in temp_f.flatten()], dtype=np.uint8).reshape(h, w, 3)
    alpha = np.where(mask, 0, 220).astype(np.uint8)

    img = np.zeros((h, w, 4), dtype=np.uint8)
    img[:, :, :3] = rgb
    img[:, :, 3] = alpha

    im = Image.fromarray(img).resize((w * 4, h * 4), Image.BICUBIC)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def upload(path: str, content: bytes, content_type: str):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    resp = requests.post(
        url,
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        data=content,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Upload failed for {path}: {resp.status_code} {resp.text}")


def main():
    now = datetime.now(timezone.utc)
    grib_bytes = None
    used_cycle = None
    for cycle in candidate_cycles(now):
        grib_bytes = fetch_grib(cycle)
        if grib_bytes:
            used_cycle = cycle
            break

    if not grib_bytes:
        print("No GFS cycle available in the lookback window", file=sys.stderr)
        sys.exit(1)

    png_bytes = render_png(grib_bytes)
    upload("latest.png", png_bytes, "image/png")

    meta = {
        "validAt": used_cycle.isoformat(),
        "generatedAt": now.isoformat(),
        "bounds": [[BOTTOM_LAT, LEFT_LON], [TOP_LAT, RIGHT_LON]],
        "source": "NOAA GFS 0.25deg, TSOIL 0-0.1m below ground",
    }
    upload("latest.json", json.dumps(meta).encode("utf-8"), "application/json")

    print(f"Uploaded soil temp map for cycle {used_cycle.isoformat()}")


if __name__ == "__main__":
    main()
