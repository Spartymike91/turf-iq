import Link from "next/link";

export const metadata = {
  title: "How We Calculate This — Turf IQ",
};

function Badge({ tone, children }: { tone: "science" | "heuristic" | "ai" | "manual"; children: React.ReactNode }) {
  const classes = {
    science: "bg-green-pale text-green-mid",
    heuristic: "bg-amber/10 text-[#92400e]",
    ai: "bg-blue/10 text-blue",
    manual: "bg-mist/15 text-ink",
  };
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide ${classes[tone]}`}>
      {children}
    </span>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-chalk">
      <header className="bg-green-dark px-6 py-4">
        <Link href="/" className="font-serif text-xl text-white">
          Turf<span className="text-green-bright">IQ</span>
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-green-dark mb-1">How We Calculate This</h1>
        <p className="text-xs text-mist font-mono mb-4">Last updated: August 13, 2026</p>
        <p className="text-sm text-mist mb-8 max-w-2xl">
          Every number on your dashboard comes from somewhere — a published turf-science model, a
          rule of thumb, an AI estimate, or something you typed in yourself. This page tells you
          which is which, honestly, so you know how much weight to put on each one.
        </p>

        <div className="flex flex-wrap gap-3 mb-10 text-[11px]">
          <span className="flex items-center gap-1.5"><Badge tone="science">PEER-REVIEWED</Badge> published, validated model</span>
          <span className="flex items-center gap-1.5"><Badge tone="heuristic">RULE OF THUMB</Badge> established but not a formal statistical model</span>
          <span className="flex items-center gap-1.5"><Badge tone="ai">AI ESTIMATE</Badge> Claude&apos;s general knowledge, not a lookup</span>
          <span className="flex items-center gap-1.5"><Badge tone="manual">YOUR DATA</Badge> tracks what you enter, doesn&apos;t compute anything</span>
        </div>

        <div className="flex flex-col gap-9 text-[14px] leading-relaxed text-ink">
          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Weather</h2>
            <p className="mb-2">
              Forecasts, current conditions, and hourly observation history come straight from the
              National Weather Service (api.weather.gov) — the same source meteorologists use, not
              a third-party aggregator. Your course&apos;s coordinates are geocoded once from its
              city/state and cached.
            </p>
            <p>
              We cache each fetch for <strong>15 minutes</strong> per course. Within that window,
              loading a page reuses the cached data instead of re-hitting NWS; after 15 minutes,
              the next page load triggers a fresh pull. If NWS is unreachable, we serve the last
              known data rather than show nothing.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Rainfall Tracking</h2>
            <p className="mb-2">
              We use a separate source from the rest of the weather page for this one: NWS
              station observations frequently report no precipitation reading at all — even in
              clear weather — so summing them would leave real gaps. Instead, actual daily rainfall
              comes from Open-Meteo&apos;s blended forecast/reanalysis model at your course&apos;s
              exact coordinates, refreshed daily and backfilled to January 1st using their archive
              of historical data — so you get a true year-to-date total from day one, not just days
              tracked since setup.
            </p>
            <p>
              The 10-year average is computed once per course (then cached indefinitely — climate
              normals don&apos;t change day to day) as the mean daily rainfall on each calendar date
              over the past 10 years at that same location, accumulated from January 1st. &quot;Ahead&quot;
              or &quot;behind&quot; compares your real, tracked total against that historical baseline for
              today&apos;s date.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Soil Temperature</h2>
            <p className="mb-2">
              This map isn&apos;t a sensor reading — no soil probe network exists at this scale.
              It&apos;s the top 4 inches of soil temperature from NOAA&apos;s GFS weather model
              (the same national forecast model behind most weather apps), which computes soil
              state as part of running its forecast. It updates 4 times a day; we refresh our copy
              every 6 hours.
            </p>
            <p>
              The resolution is coarser than the radar or rainfall data — about 17 miles per grid
              cell, versus radar&apos;s 1km — so treat it as a regional trend, not a
              precise reading for your exact location. Rendering happens outside the main app on a
              schedule, since decoding weather-model data isn&apos;t something a typical web server
              is built to do.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">
              Growing Degree Days (GDD) <Badge tone="science">STANDARD FORMULA</Badge>
            </h2>
            <p>
              We use the standard simple-average method with a 50°F base: <code className="text-xs bg-white border border-rule rounded px-1.5 py-0.5">GDD = ((high°F + low°F) / 2) − 50</code>,
              floored at zero. It&apos;s computed once per day from that day&apos;s forecast high/low
              and added to your season total, which starts accumulating from January 1st (or from
              whenever your course was set up, if that&apos;s later in the year — see the note under
              Pest &amp; Weed Timing below).
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Disease Risk</h2>
            <p className="mb-3">
              <strong>Dollar Spot</strong> <Badge tone="science">PEER-REVIEWED</Badge> — the
              Smith-Kerns model (Koch et al., 2018, <em>PLOS ONE</em>), a logistic regression built
              from real disease-outbreak data. It takes the mean temperature and relative humidity
              over the trailing 5 days of hourly observations and outputs a probability of outbreak.
              We flag action-needed at 20% probability, matching the model&apos;s published
              threshold.
            </p>
            <p className="mb-3">
              <strong>Pythium Blight</strong> <Badge tone="heuristic">RULE OF THUMB</Badge> — a
              threshold model (after Nutter-Shane): elevated when the trailing 24 hours had a high
              above 86°F, a low above 68°F, and at least 14 hours above 90% relative humidity.
              Rule-based, not a fitted statistical model.
            </p>
            <p>
              <strong>Brown Patch</strong> <Badge tone="heuristic">RULE OF THUMB</Badge> — we&apos;ll
              be direct about this one: there&apos;s no formally validated predictive model for
              Brown Patch in the turf-science literature we&apos;re aware of. We flag elevated risk
              when overnight lows stay above 68°F with 6+ hours above 95% humidity, which is a
              reasonable qualitative signal, not a calibrated probability like Dollar Spot&apos;s.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">
              Fertility <Badge tone="manual">YOUR DATA</Badge>
            </h2>
            <p>
              This module doesn&apos;t predict anything — it tracks what you tell it. Nutrient
              deficiency flags compare your most recent soil test against standard reference ranges
              (pH 6.0–7.0, phosphorus 25–50 ppm, potassium 100–200 ppm, iron 80–120 ppm). Your
              annual nitrogen target is whatever you enter for the fiscal year; the progress bar is
              just your logged applications summed against that number.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Pest &amp; Weed Timing</h2>
            <p className="mb-3">
              All three models below key off season-to-date GDD (base 50°F, as above) rather than
              the calendar — pest development tracks heat accumulation, not dates.
            </p>
            <p className="mb-3">
              <strong>Crabgrass</strong> and <strong>Annual Bluegrass Weevil</strong> (cool-season
              grasses only) <Badge tone="heuristic">RULE OF THUMB</Badge> — GDD windows corroborated
              against public extension guidance (Purdue, Michigan State GDDTracker, UW-Madison).
            </p>
            <p className="mb-3">
              <strong>White Grub</strong> <Badge tone="heuristic">RULE OF THUMB — LOWER CONFIDENCE</Badge> —
              we&apos;ll flag this one honestly too: these GDD windows come from general industry
              guidance rather than a primary university extension source, so treat the timing as
              directional.
            </p>
            <p className="text-xs text-mist">
              Note: if your course was set up partway through the season, season-to-date GDD only
              reflects days tracked since setup — we show a warning on the Pest &amp; Weed page when
              that gap could be throwing off the numbers.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Irrigation</h2>
            <p className="mb-3">
              Tonight&apos;s ET (evapotranspiration) target uses the <strong>FAO-56 Hargreaves
              equation</strong> <Badge tone="science">PEER-REVIEWED</Badge> — the standard
              approximation for when you don&apos;t have a full weather station (solar radiation,
              wind speed, vapor pressure) on site, using just temperature, your course&apos;s
              latitude, and day of year. That inches-of-water figure is converted to gallons using
              your maintained acreage.
            </p>
            <p>
              Soil moisture readings <Badge tone="manual">YOUR DATA</Badge> are logged by hand — we
              don&apos;t have sensor integration yet — and shown as a separate signal alongside the
              ET target rather than blended into one number. You&apos;re meant to read both, not just
              one.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Equipment</h2>
            <p className="mb-3">
              <strong>Suggested maintenance schedules</strong> <Badge tone="ai">AI ESTIMATE</Badge> —
              when you ask us to suggest a schedule for a piece of equipment, Claude generates it
              from general knowledge of typical maintenance intervals for that type of machine. It
              is <em>not</em> looking up your specific manufacturer&apos;s service manual — always
              cross-check against the actual documentation for your equipment before relying on it.
            </p>
            <p>
              <strong>5-year replacement planning</strong> <Badge tone="heuristic">SIMPLE HEURISTIC</Badge> —
              every piece of equipment is planned for replacement 5 years from its purchase date,
              flat, regardless of type. It&apos;s a usable default for capital planning, not a
              model tuned to mower duty cycles vs. utility vehicles vs. sprayers.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">
              Daily Briefing &amp; Ask the Agronomist <Badge tone="ai">AI ESTIMATE</Badge>
            </h2>
            <p className="mb-3">
              Both features are Claude (Anthropic), given real data pulled from your course each
              time — current weather and disease risk, GDD-based pest status, your recent pest and
              fertilizer applications, today&apos;s scheduled tasks, equipment maintenance status,
              and (in the chat) your budget, labor, and irrigation history too. It&apos;s answering
              from your actual records, not guessing.
            </p>
            <p>
              We explicitly instruct it not to invent facts and not to recommend specific pesticide
              products or application rates — for those, it&apos;ll point you to a licensed
              applicator or the product label rather than make the call for you.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">Questions?</h2>
            <p>
              If something looks off, or you want more detail on any of these, reach out at{" "}
              <a href="mailto:mikeconley7@gmail.com" className="text-green-mid font-semibold hover:underline">
                mikeconley7@gmail.com
              </a>
              . See also our{" "}
              <Link href="/terms" className="text-green-mid font-semibold hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-green-mid font-semibold hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
