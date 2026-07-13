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
 */
export async function getPlatformAdminSession(): Promise<PlatformAdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, isPlatformAdmin: false, isEditElevated: false };

  const [{ data: adminRow }, { data: editSession }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("admin_edit_sessions").select("expires_at").eq("user_id", user.id).maybeSingle(),
  ]);

  const isEditElevated = !!editSession && new Date(editSession.expires_at) > new Date();

  return { user, isPlatformAdmin: !!adminRow, isEditElevated };
}
