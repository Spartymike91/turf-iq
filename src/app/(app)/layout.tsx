import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
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

  // Fetch the user's course
  const [{ data: membership }, { isPlatformAdmin }] = await Promise.all([
    supabase
      .from("course_members")
      .select("course_id, role, courses(name)")
      .eq("user_id", user.id)
      .limit(1)
      .single(),
    getPlatformAdminSession(),
  ]);

  const courseName =
    (membership?.courses as unknown as { name: string } | null)?.name ?? undefined;

  return (
    <AppShell courseName={courseName} isPlatformAdmin={isPlatformAdmin}>
      {children}
    </AppShell>
  );
}
