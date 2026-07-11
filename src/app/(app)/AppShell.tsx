"use client";

import { useState } from "react";
import AppHeader from "@/components/layout/AppHeader";
import AgronomistPanel from "@/components/agronomist/AgronomistPanel";

export default function AppShell({
  courseName,
  isPlatformAdmin,
  children,
}: {
  courseName?: string;
  isPlatformAdmin?: boolean;
  children: React.ReactNode;
}) {
  const [agronomistOpen, setAgronomistOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AppHeader
        courseName={courseName}
        isPlatformAdmin={isPlatformAdmin}
        onToggleAgronomist={() => setAgronomistOpen(!agronomistOpen)}
      />
      <div className="flex flex-1 overflow-hidden">
        <main
          className={`flex-1 overflow-y-auto p-6 flex flex-col gap-5 transition-[margin-right] duration-300 ${
            agronomistOpen ? "mr-[440px]" : ""
          }`}
        >
          {children}
        </main>
        <AgronomistPanel
          open={agronomistOpen}
          onClose={() => setAgronomistOpen(false)}
        />
      </div>
    </div>
  );
}
