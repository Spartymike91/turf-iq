import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import { resolveCourseIdServer } from "@/lib/supabase/course-context.server";
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
  if (context?.courseId) {
    const { data: course } = await supabase
      .from("courses")
      .select("name")
      .eq("id", context.courseId)
      .single();
    courseName = course?.name ?? undefined;
  }

  return (
    <AppShell
      courseName={courseName}
      isPlatformAdmin={isPlatformAdmin}
      isAdminView={isAdminView}
      isEditElevated={isAdminView && isEditElevated}
    >
      {children}
    </AppShell>
  );
}
