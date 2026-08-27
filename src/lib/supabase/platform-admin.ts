import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type PlatformAdminSession =
  | { user: null; isPlatformAdmin: false; isEditElevated: false }
  | { user: User; isPlatformAdmin: boolean; isEditElevated: boolean };

/**
 * The only place platform_admins is checked. Every /admin page, layout, and
 * /api/admin/* route must call this rather than re-implementing the check.
 *
 * isEditElevated reflects whether this admin has unlocked edit mode (via
 * POST /api/admin/elevate + their personal PIN) within the last 30 minutes —
 * viewing customer data never requires this, only writes do.
 *
 * Pass `knownUser` when the caller already resolved the user for its own
 * auth check this request, to skip a second `auth.getUser()` round-trip.
 */
export async function getPlatformAdminSession(knownUser?: User | null): Promise<PlatformAdminSession> {
  const supabase = await createClient();
  const user = knownUser !== undefined ? knownUser : (await supabase.auth.getUser()).data.user;

  if (!user) return { user: null, isPlatformAdmin: false, isEditElevated: false };

  const [{ data: adminRow }, { data: editSession }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("admin_edit_sessions").select("expires_at").eq("user_id", user.id).maybeSingle(),
  ]);

  const isEditElevated = !!editSession && new Date(editSession.expires_at) > new Date();

  return { user, isPlatformAdmin: !!adminRow, isEditElevated };
}
