"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-green-dark flex items-center justify-between border-b-2 border-green-forest px-6 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="font-serif text-[19px] text-white">
            Turf<span className="text-green-bright">IQ</span>
          </Link>
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50 border border-white/20 rounded-full px-2 py-0.5">
            Platform Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-[11px] text-white/60 hover:text-white/90">
            ← Back to my course
          </Link>
          <button onClick={handleLogout} className="text-[11px] text-white/50 hover:text-white/80">
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 p-6 bg-chalk overflow-y-auto flex flex-col gap-5">{children}</main>
    </div>
  );
}
