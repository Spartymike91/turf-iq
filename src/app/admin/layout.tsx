import { redirect } from "next/navigation";
import { getPlatformAdminSession } from "@/lib/supabase/platform-admin";
import AdminShell from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isPlatformAdmin } = await getPlatformAdminSession();

  if (!user) redirect("/login");
  if (!isPlatformAdmin) redirect("/dashboard");

  return <AdminShell>{children}</AdminShell>;
}
