"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import AgronomistPanel from "@/components/agronomist/AgronomistPanel";
import { hasModuleAccess, getModuleLabel, getRequiredTier } from "@/lib/planAccess";
import { PLAN_DISPLAY, type PlanTier } from "@/lib/billing";

export default function AppShell({
  courseName,
  isPlatformAdmin,
  isAdminView,
  isEditElevated,
  planTier,
  children,
}: {
  courseName?: string;
  isPlatformAdmin?: boolean;
  isAdminView?: boolean;
  isEditElevated?: boolean;
  planTier?: PlanTier | null;
  children: React.ReactNode;
}) {
  const [agronomistOpen, setAgronomistOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [pin, setPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Admin View (a platform admin inspecting a different customer's course for
  // support) always gets full access, regardless of that course's tier. A
  // platform admin using their own course is still gated normally.
  const locked = !isAdminView && !hasModuleAccess(planTier ?? null, pathname);
  const requiredTier = locked ? getRequiredTier(pathname) : null;
  const moduleInfo = locked ? getModuleLabel(pathname) : null;

  async function handleExitAdminView() {
    setExiting(true);
    await fetch("/api/admin/view-course", { method: "DELETE" });
    router.push("/admin");
    router.refresh();
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setUnlocking(true);
    setUnlockError(null);
    const res = await fetch("/api/admin/elevate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (res.ok) {
      setPin("");
      router.refresh();
    } else {
      setUnlockError(data.error ?? "Could not unlock editing.");
    }
    setUnlocking(false);
  }

  async function handleLock() {
    setLocking(true);
    await fetch("/api/admin/elevate", { method: "DELETE" });
    router.refresh();
    setLocking(false);
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {isAdminView && (
        <div className="bg-amber-500 text-amber-950 flex items-center justify-center flex-wrap gap-3 px-4 py-1.5 text-[12.5px] font-semibold shrink-0 z-50">
          <span>
            ⚠ Admin View — {courseName ?? "this course"} ·{" "}
            {isEditElevated ? "editing unlocked" : "view-only"}
          </span>

          {isEditElevated ? (
            <button
              onClick={handleLock}
              disabled={locking}
              className="underline underline-offset-2 hover:no-underline disabled:opacity-50"
            >
              {locking ? "Locking…" : "Lock editing"}
            </button>
          ) : (
            <form onSubmit={handleUnlock} className="flex items-center gap-1.5">
              <input
                type="password"
                inputMode="numeric"
                maxLength={12}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="w-16 px-1.5 py-0.5 rounded border border-amber-950/30 bg-white/70 text-[12px] outline-none focus:border-amber-950"
              />
              <button
                type="submit"
                disabled={unlocking || !pin}
                className="underline underline-offset-2 hover:no-underline disabled:opacity-50"
              >
                {unlocking ? "Checking…" : "Unlock editing"}
              </button>
            </form>
          )}

          {unlockError && <span className="text-red-900">{unlockError}</span>}

          <button
            onClick={handleExitAdminView}
            disabled={exiting}
            className="underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            {exiting ? "Exiting…" : "Exit admin view"}
          </button>
        </div>
      )}
      <AppHeader
        courseName={courseName}
        isPlatformAdmin={isPlatformAdmin}
        isAdminView={isAdminView}
        planTier={planTier}
        onToggleAgronomist={() => setAgronomistOpen(!agronomistOpen)}
      />
      <div className="flex flex-1 overflow-hidden">
        <main
          className={`flex-1 overflow-y-auto p-6 flex flex-col gap-5 transition-[margin-right] duration-300 ${
            agronomistOpen ? "mr-[440px]" : ""
          }`}
        >
          {locked && requiredTier ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="max-w-sm text-center bg-white border-[1.5px] border-rule rounded-[10px] p-8">
                <div className="text-4xl mb-3">{moduleInfo?.icon ?? "🔒"}</div>
                <div className="font-serif text-xl text-green-dark mb-2">
                  {moduleInfo?.label ?? "This module"} is locked
                </div>
                <div className="text-sm text-mist mb-5">
                  Included in the {PLAN_DISPLAY[requiredTier].name} plan (${PLAN_DISPLAY[requiredTier].price}/mo).
                  Upgrade to unlock it for this course.
                </div>
                <button
                  onClick={() => router.push("/course")}
                  className="px-4 py-2 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors"
                >
                  View Plans
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
        <AgronomistPanel
          open={agronomistOpen}
          onClose={() => setAgronomistOpen(false)}
        />
      </div>
    </div>
  );
}
