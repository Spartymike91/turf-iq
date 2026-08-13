"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getRequiredTier, TIER_RANK, ALL_MODULES } from "@/lib/planAccess";
import { PLAN_DISPLAY, type PlanTier } from "@/lib/billing";

const tabs = ALL_MODULES;

export default function AppHeader({
  courseName,
  isPlatformAdmin,
  isAdminView,
  planTier,
  allowedModules,
  onToggleAgronomist,
}: {
  courseName?: string;
  isPlatformAdmin?: boolean;
  isAdminView?: boolean;
  planTier?: PlanTier | null;
  allowedModules?: string[] | null;
  onToggleAgronomist?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Admin View (inspecting a different customer's course) always sees every
  // tab. A platform admin using their own course is still gated normally.
  const bypassGating = !!isAdminView;

  // Route changes close the mobile menu — it's a Link, not a full reload, so
  // AppHeader stays mounted and the menu would otherwise stay open over the
  // new page. Reset during render (React's documented pattern for this)
  // rather than in an effect, to avoid an extra post-navigation render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileMenuOpen(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Permission-denied tabs are omitted entirely (not shown greyed-out like
  // tier-locked ones) — a crew member can't grant themselves access, so
  // there's nothing actionable to show them, unlike the tier upsell.
  const tabsWithState = tabs
    .filter((tab) => bypassGating || !allowedModules || allowedModules.includes(tab.slug))
    .map((tab) => {
      const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
      const requiredTier = getRequiredTier(tab.href);
      const locked =
        !bypassGating &&
        !!requiredTier &&
        !!planTier &&
        TIER_RANK[planTier] < TIER_RANK[requiredTier];
      return { ...tab, isActive, requiredTier, locked };
    });

  return (
    <div className="relative shrink-0 z-50">
      <header className="bg-green-dark flex items-stretch border-b-2 border-green-forest px-3 sm:px-6">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          className="md:hidden flex items-center px-1 mr-2 text-white/70 hover:text-white"
        >
          <span className="text-xl leading-none">{mobileMenuOpen ? "✕" : "☰"}</span>
        </button>

        <Link
          href="/dashboard"
          className="font-serif text-[19px] text-white flex items-center py-3 mr-5 whitespace-nowrap"
        >
          Turf<span className="text-green-bright">IQ</span>
        </Link>

        <nav className="hidden md:flex items-stretch flex-1 overflow-x-auto gap-0 [&::-webkit-scrollbar]:hidden">
          {tabsWithState.map((tab) => {
            if (tab.locked) {
              return (
                <button
                  key={tab.href}
                  type="button"
                  onClick={() => router.push("/course")}
                  title={`Included in the ${PLAN_DISPLAY[tab.requiredTier!].name} plan ($${PLAN_DISPLAY[tab.requiredTier!].price}/mo) — visit Course to upgrade.`}
                  className="px-2 sm:px-3.5 text-xs font-medium flex items-center gap-1.5 border-b-2 border-transparent -mb-[2px] whitespace-nowrap select-none text-white/25 cursor-pointer hover:text-white/40 transition-colors"
                >
                  <span className="text-[13px] opacity-50">{tab.icon}</span>
                  {tab.label}
                  <span className="text-[9px]">🔒</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-2 sm:px-3.5 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-[2px] transition-all whitespace-nowrap select-none ${
                  tab.isActive
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

        <div className="flex items-center gap-2.5 py-2.5 shrink-0 ml-auto md:ml-0">
          {onToggleAgronomist && (
            <button
              onClick={onToggleAgronomist}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 bg-gradient-to-br from-green-mid to-green-forest border border-green-bright/40 rounded-lg text-white text-xs font-semibold cursor-pointer transition-all shadow-[0_2px_8px_rgba(45,106,79,0.35)] hover:from-green-dark hover:to-green-mid hover:shadow-[0_4px_16px_rgba(82,183,136,0.3)] hover:-translate-y-px whitespace-nowrap"
            >
              <span>🌿</span> <span className="hidden sm:inline">Ask the Agronomist </span>
              <span className="text-[9px] font-bold bg-green-bright text-green-dark px-1.5 py-0.5 rounded font-mono tracking-wide">
                AI
              </span>
            </button>
          )}
          {courseName && (
            <Link
              href="/course"
              className="hidden sm:inline-block text-[11px] text-green-bright bg-green-bright/12 border border-green-bright/25 px-2.5 py-1 rounded-full font-medium whitespace-nowrap hover:bg-green-bright/20 transition-colors"
            >
              ⛳ {courseName}
            </Link>
          )}
          {isPlatformAdmin && (
            <Link
              href="/admin"
              className="hidden sm:inline-block text-[11px] text-white bg-white/10 border border-white/25 px-2.5 py-1 rounded-full font-medium whitespace-nowrap hover:bg-white/20 transition-colors"
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

      {mobileMenuOpen && (
        <nav className="md:hidden absolute inset-x-0 top-full bg-green-dark border-b-2 border-green-forest shadow-lg max-h-[calc(100vh-56px)] overflow-y-auto">
          {tabsWithState.map((tab) => {
            if (tab.locked) {
              return (
                <button
                  key={tab.href}
                  type="button"
                  onClick={() => router.push("/course")}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left text-white/30 border-b border-white/[0.07] last:border-0"
                >
                  <span className="text-base opacity-50">{tab.icon}</span>
                  {tab.label}
                  <span className="text-xs ml-auto">
                    🔒 {PLAN_DISPLAY[tab.requiredTier!].name}
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2.5 px-4 py-3 text-sm font-medium border-b border-white/[0.07] last:border-0 ${
                  tab.isActive ? "text-white bg-white/[0.06]" : "text-white/60"
                }`}
              >
                <span className="text-base">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
