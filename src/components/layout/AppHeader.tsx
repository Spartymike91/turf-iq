"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const tabs = [
  { href: "/weather", icon: "🌤", label: "Weather" },
  { href: "/disease", icon: "🦠", label: "Disease Risk" },
  { href: "/fertility", icon: "🌱", label: "Fertility" },
  { href: "/irrigation", icon: "💧", label: "Irrigation" },
  { href: "/pest-weed", icon: "🧪", label: "Pest & Weed" },
  { href: "/equipment", icon: "🔧", label: "Equipment" },
  { href: "/budget", icon: "📊", label: "Budget" },
  { href: "/labor", icon: "👷", label: "Labor" },
  { href: "/tasks", icon: "📋", label: "Tasks" },
  { href: "/team", icon: "👥", label: "Team" },
];

export default function AppHeader({
  courseName,
  isPlatformAdmin,
  onToggleAgronomist,
}: {
  courseName?: string;
  isPlatformAdmin?: boolean;
  onToggleAgronomist?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-green-dark flex items-stretch border-b-2 border-green-forest shrink-0 z-50 px-6">
      <Link
        href="/dashboard"
        className="font-serif text-[19px] text-white flex items-center py-3 mr-5 whitespace-nowrap"
      >
        Turf<span className="text-green-bright">IQ</span>
      </Link>

      <nav className="flex items-stretch flex-1 overflow-x-auto gap-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3.5 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-[2px] transition-all whitespace-nowrap select-none ${
                isActive
                  ? "text-white border-green-bright"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`}
            >
              <span className="text-[13px]">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 py-2.5 shrink-0">
        {onToggleAgronomist && (
          <button
            onClick={onToggleAgronomist}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-br from-green-mid to-green-forest border border-green-bright/40 rounded-lg text-white text-xs font-semibold cursor-pointer transition-all shadow-[0_2px_8px_rgba(45,106,79,0.35)] hover:from-green-dark hover:to-green-mid hover:shadow-[0_4px_16px_rgba(82,183,136,0.3)] hover:-translate-y-px whitespace-nowrap"
          >
            <span>🌿</span> Ask the Agronomist{" "}
            <span className="text-[9px] font-bold bg-green-bright text-green-dark px-1.5 py-0.5 rounded font-mono tracking-wide">
              AI
            </span>
          </button>
        )}
        {courseName && (
          <Link
            href="/course"
            className="text-[11px] text-green-bright bg-green-bright/12 border border-green-bright/25 px-2.5 py-1 rounded-full font-medium whitespace-nowrap hover:bg-green-bright/20 transition-colors"
          >
            ⛳ {courseName}
          </Link>
        )}
        {isPlatformAdmin && (
          <Link
            href="/admin"
            className="text-[11px] text-white bg-white/10 border border-white/25 px-2.5 py-1 rounded-full font-medium whitespace-nowrap hover:bg-white/20 transition-colors"
          >
            ⚙ Admin
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
