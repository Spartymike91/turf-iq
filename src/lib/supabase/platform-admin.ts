import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unstable_cache } from "next/cache";
import type { User } from "@supabase/supabase-js";

type PlatformAdminSession =
  | { user: null; isPlatformAdmin: false; isEditElevated: false }
  | { user: User; isPlatformAdmin: boolean; isEditElevated: boolean };

// Platform admin membership changes essentially never in practice — it's
// granted/revoked by hand directly in Supabase, not from any in-app UI —
// but this check runs on every single page load for every user in the app
// (see getPlatformAdminSession). Caching it turns nearly all of those into
// a cache hit instead of a DB round-trip. Uses the admin client rather than
// the per-request cookie-aware one because unstable_cache can't access
// cookies/headers inside its scope; the userId passed in is already a
// resolved, trusted value from the caller's own auth check, not user input.
const getCachedIsPlatformAdmin = unstable_cache(
  async (userId: string): Promise<boolean> => {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !!data;
  },
  ["platform-admin-status"],
  { revalidate: 60 }
);

/**
 * The only place platform_admins is checked. Every /admin page, layout, and
 * /api/admin/* route must call this rather than re-implementing the check.
 *
 * isEditElevated reflects whether this admin has unlocked edit mode (via
 * POST /api/admin/elevate + their personal PIN) within the last 30 minutes —
 * viewing customer data never requires this, only writes do. Deliberately
 * NOT cached like the admin check above — a user who just entered their PIN
 * expects elevation to take effect immediately, not after up to a minute.
 *
 * Pass `knownUser` when the caller already resolved the user for its own
 * auth check this request, to skip a second `auth.getUser()` round-trip.
 */
export async function getPlatformAdminSession(knownUser?: User | null): Promise<PlatformAdminSession> {
  const supabase = await createClient();
  const user = knownUser !== undefined ? knownUser : (await supabase.auth.getUser()).data.user;

  if (!user) return { user: null, isPlatformAdmin: false, isEditElevated: false };

  const [isPlatformAdmin, { data: editSession }] = await Promise.all([
    getCachedIsPlatformAdmin(user.id),
    supabase.from("admin_edit_sessions").select("expires_at").eq("user_id", user.id).maybeSingle(),
  ]);

  const isEditElevated = !!editSession && new Date(editSession.expires_at) > new Date();

  return { user, isPlatformAdmin, isEditElevated };
}
