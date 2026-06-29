import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const { data: membership } = await supabase
    .from("course_members")
    .select("course_id, role, courses(name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const courseName =
    (membership?.courses as unknown as { name: string } | null)?.name ?? undefined;

  return <AppShell courseName={courseName}>{children}</AppShell>;
}
