"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getRequiredTier, TIER_RANK, ALL_MODULES } from "@/lib/planAccess";
import { PLAN_DISPLAY, type PlanTier } from "@/lib/billing";
import type { UserCourseSummary } from "@/lib/supabase/course-context";
import { checkHasUnreadChat } from "@/lib/chatUnread";

const tabs = ALL_MODULES;

export default function AppHeader({
  courseName,
  isPlatformAdmin,
  isAdminView,
  planTier,
  allowedModules,
  courses,
  currentCourseId,
}: {
  courseName?: string;
  isPlatformAdmin?: boolean;
  isAdminView?: boolean;
  planTier?: PlanTier | null;
  allowedModules?: string[] | null;
  courses?: UserCourseSummary[];
  currentCourseId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [realtimeClient] = useState(() => createClient());

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen]);
  // Admin View (inspecting a different customer's course) always sees every
  // tab. A platform admin using their own course is still gated normally.
  const bypassGating = !!isAdminView;

  // Chat unread dot — resolved client-side (own course_members.id isn't
  // threaded through as a prop) and kept live via its own Realtime
  // subscription so it updates while the user is on any page, not just
  // /chat. Skipped in Admin View, which has no real course_members row.
  const [chatHasUnread, setChatHasUnread] = useState(false);
  useEffect(() => {
    if (isAdminView || !currentCourseId) return;
    const supabase = realtimeClient;
    let cancelled = false;
    let myCourseMemberId: string | null = null;

    // The Realtime subscription below is set up immediately (not gated on
    // this resolving first) so a message arriving during the brief window
    // before we know our own course_members.id still isn't missed — the
    // sender-id check inside the handler just falls back to "not mine" and
    // shows the dot until this resolves.
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("course_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", currentCourseId!)
        .single();
      if (cancelled || !membership) return;
      myCourseMemberId = membership.id;
      const unread = await checkHasUnreadChat(supabase, currentCourseId!, membership.id);
      if (!cancelled) setChatHasUnread(unread);
    }
    init();

    // Uses the stable `realtimeClient` instance (not a freshly-created one)
    // — a fresh createClient() call here was confirmed live to silently
    // never deliver postgres_changes events, despite reporting a healthy
    // SUBSCRIBED status. Match this pattern for any future Realtime
    // subscription in a client component.
    const channel = supabase
      .channel(`app-header-chat:${currentCourseId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `course_id=eq.${currentCourseId}` },
        (payload) => {
          const isMine = myCourseMemberId && (payload.new as { sender_id?: string }).sender_id === myCourseMemberId;
          // If they're already on /chat, that page owns marking things read
          // — don't fight it with a dot that would immediately be wrong.
          if (!isMine && window.location.pathname !== "/chat") setChatHasUnread(true);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isAdminView, currentCourseId, realtimeClient]);

  // Cleared during render (same pattern as lastPathname below) rather than
  // in an effect, the moment the user actually lands on /chat.
  if (pathname === "/chat" && chatHasUnread) {
    setChatHasUnread(false);
  }

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

  // A hard navigation (not router.push) is deliberate and load-bearing:
  // most pages resolve their course id inside a mount-only useEffect, which
  // won't re-run just because router.refresh() re-renders server
  // components — and confirmed live, router.push("/dashboard") is a no-op
  // for the page's own client component when you're switching *from*
  // /dashboard itself (same pathname, so Next never remounts it), leaving
  // the old course's data on screen despite the cookie having actually
  // changed. window.location.href forces a real page load every time,
  // regardless of which page the switch was triggered from.
  async function handleSwitchCourse(courseId: string) {
    if (courseId === currentCourseId) {
      setAccountMenuOpen(false);
      return;
    }
    await fetch("/api/course/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId }),
    });
    setAccountMenuOpen(false);
    window.location.assign("/dashboard");
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
                className={`relative px-2 sm:px-3.5 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-[2px] transition-all whitespace-nowrap select-none ${
                  tab.isActive
                    ? "text-white border-green-bright"
                    : "text-white/50 border-transparent hover:text-white/80"
                }`}
              >
                <span className="text-[13px]">{tab.icon}</span>
                {tab.label}
                {tab.slug === "chat" && chatHasUnread && (
                  <span className="absolute top-1.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 py-2.5 shrink-0 ml-auto md:ml-0">
          <div className="relative" ref={accountMenuRef}>
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-white bg-white/10 border border-white/25 px-2.5 py-1 rounded-full font-medium whitespace-nowrap hover:bg-white/20 transition-colors"
            >
              {courseName ? <>⛳ {courseName}</> : "👤 Account"}
              <span className="text-[9px] opacity-70">▾</span>
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-rule rounded-lg shadow-lg overflow-hidden z-50">
                {courses && courses.length > 1 && (
                  <div className="border-b border-rule">
                    <div className="px-3.5 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-mist">
                      Switch Course
                    </div>
                    {courses.map((c) => (
                      <button
                        key={c.courseId}
                        onClick={() => handleSwitchCourse(c.courseId)}
                        className={`w-full text-left px-3.5 py-2 text-xs hover:bg-chalk transition-colors ${
                          c.courseId === currentCourseId ? "text-green-dark font-semibold" : "text-ink"
                        }`}
                      >
                        {c.courseId === currentCourseId ? "✓ " : ""}
                        {c.courseName}
                      </button>
                    ))}
                  </div>
                )}
                <Link
                  href="/course"
                  className="block px-3.5 py-2.5 text-xs text-ink hover:bg-chalk transition-colors"
                >
                  ⛳ Course Settings
                </Link>
                {!isAdminView && (
                  <Link
                    href="/course/new"
                    className="block px-3.5 py-2.5 text-xs text-ink hover:bg-chalk transition-colors border-t border-rule"
                  >
                    + Add Another Course
                  </Link>
                )}
                {isPlatformAdmin && (
                  <Link
                    href="/admin"
                    className="block px-3.5 py-2.5 text-xs text-ink hover:bg-chalk transition-colors border-t border-rule"
                  >
                    ⚙ Admin Panel
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3.5 py-2.5 text-xs text-red hover:bg-chalk transition-colors border-t border-rule"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
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
                {tab.slug === "chat" && chatHasUnread && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red ml-auto" />
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
