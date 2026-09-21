import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sw.js and manifest.webmanifest were falling through this exclusion
    // list and getting the normal auth-required redirect to /login for any
    // request without a valid session cookie — confirmed via a plain curl
    // with no cookies. A manifest/service-worker file needs to be
    // fetchable without being logged in (a new user adding the site to
    // their Home Screen before ever signing in, or Safari silently
    // re-validating an already-installed icon's manifest) — this isn't
    // content that should ever require auth.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
