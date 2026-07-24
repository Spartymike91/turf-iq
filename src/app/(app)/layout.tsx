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

  return (
    <AppShell
      courseName={courseName}
      isPlatformAdmin={isPlatformAdmin}
      isAdminView={isAdminView}
      isEditElevated={isAdminView && isEditElevated}
      planTier={planTier}
    >
      {children}
    </AppShell>
  );
}
