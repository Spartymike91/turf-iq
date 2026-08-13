import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
import { isPlanTier, type PlanTier } from "@/lib/billing";
import AppShell from "./AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { isPlatformAdmin, isEditElevated } = await getPlatformAdminSession();
  const context = await resolveCourseIdServer(supabase);

  // isAdminView is only trusted for display once isPlatformAdmin is also
  // server-verified — the cookie alone isn't proof of anything (RLS is the
  // real gate on the data itself), but it shouldn't drive the UI for a
  // non-admin who happened to have it set.
  const isAdminView = !!context?.isAdminView && isPlatformAdmin;

  let courseName: string | undefined;
  let planTier: PlanTier | null = null;
  if (context?.courseId) {
    const { data: course } = await supabase
      .from("courses")
      .select("name, plan_tier")
      .eq("id", context.courseId)
      .single();
    courseName = course?.name ?? undefined;
    planTier = isPlanTier(course?.plan_tier) ? course.plan_tier : null;
  }

  // Owner/superintendent are always unrestricted regardless of what's stored
  // on their row — the invite/edit UI never offers the checklist to them in
  // the first place, this is just a server-side safety net. Admin view (a
  // platform admin inspecting a customer's course) is unrestricted too, same
  // as tier gating.
  let allowedModules: string[] | null = null;
  if (context?.courseId && !isAdminView) {
    const { data: membership } = await supabase
      .from("course_members")
      .select("role, allowed_modules")
      .eq("user_id", user.id)
      .eq("course_id", context.courseId)
      .single();
    if (membership && membership.role !== "owner" && membership.role !== "superintendent") {
      allowedModules = membership.allowed_modules ?? null;
    }
  }

  return (
    <AppShell
      courseName={courseName}
      isPlatformAdmin={isPlatformAdmin}
      isAdminView={isAdminView}
      isEditElevated={isAdminView && isEditElevated}
      planTier={planTier}
      allowedModules={allowedModules}
    >
      {children}
    </AppShell>
  );
}
