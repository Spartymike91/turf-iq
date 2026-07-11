import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type PlatformAdminSession =
  | { user: null; isPlatformAdmin: false }
  | { user: User; isPlatformAdmin: boolean };

/**
 * The only place platform_admins is checked. Every /admin page, layout, and
 * /api/admin/* route must call this rather than re-implementing the check.
 */
export async function getPlatformAdminSession(): Promise<PlatformAdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, isPlatformAdmin: false };

  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, isPlatformAdmin: !!data };
}
