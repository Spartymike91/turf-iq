// Single source of truth for course_members.role — previously duplicated
// across team/page.tsx, api/team/invite/route.ts, and email.ts with no
// shared import, which is exactly the kind of drift risk that shows up when
// a new role gets added in one copy but not the others.
export type Role = "owner" | "superintendent" | "assistant" | "crew_lead" | "equipment_manager" | "crew";

export const ALL_ROLES: Role[] = ["owner", "superintendent", "assistant", "crew_lead", "equipment_manager", "crew"];

// Junior roles get the allowed_modules visibility checklist in the invite/edit
// UI (see planAccess.ts's hasModulePermission) — owner/superintendent are
// always unrestricted. Note this is a visibility layer only: most junior
// roles have no RLS write access to anything beyond task assignments.
// equipment_manager is the first junior role with real RLS write access
// (equipment + maintenance tables — see supabase-schema.sql).
export const JUNIOR_ROLES: Role[] = ["assistant", "crew_lead", "equipment_manager", "crew"];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  superintendent: "Superintendent",
  assistant: "Assistant",
  crew_lead: "Crew Lead",
  equipment_manager: "Equipment Manager",
  crew: "Crew",
};
