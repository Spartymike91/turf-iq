import type { SupabaseClient } from "@supabase/supabase-js";

// Everything a course owns, gathered into one downloadable bundle so
// customers are never locked in — the mirror image of importing data in.
// Uses the caller's own session-scoped client, so normal RLS applies; no
// admin/service-role access needed since owners/superintendents already have
// SELECT on all of this.
export async function buildCourseExport(supabase: SupabaseClient, courseId: string) {
  const [
    course,
    team,
    employees,
    budgetCategories,
    expenses,
    fertilityPrograms,
    fertilizerApplications,
    soilTests,
    gddDailyLog,
    diseaseRiskDailyLog,
    taskTemplates,
    taskAssignments,
    timeEntries,
    equipment,
    pestApplications,
    irrigationPrograms,
    irrigationLogs,
    soilMoistureReadings,
    monthlyReports,
  ] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).single(),
    supabase.from("course_members").select("role, profiles(full_name, email)").eq("course_id", courseId),
    supabase.from("employees").select("*").eq("course_id", courseId),
    supabase.from("budget_categories").select("*").eq("course_id", courseId),
    supabase.from("expenses").select("*").eq("course_id", courseId),
    supabase.from("fertility_programs").select("*").eq("course_id", courseId),
    supabase.from("fertilizer_applications").select("*").eq("course_id", courseId),
    supabase.from("soil_tests").select("*").eq("course_id", courseId),
    supabase.from("gdd_daily_log").select("*").eq("course_id", courseId),
    supabase.from("disease_risk_daily_log").select("*").eq("course_id", courseId),
    supabase.from("task_templates").select("*").eq("course_id", courseId),
    supabase.from("task_assignments").select("*").eq("course_id", courseId),
    supabase.from("time_entries").select("*").eq("course_id", courseId),
    supabase.from("equipment").select("*").eq("course_id", courseId),
    supabase.from("pest_applications").select("*").eq("course_id", courseId),
    supabase.from("irrigation_programs").select("*").eq("course_id", courseId),
    supabase.from("irrigation_logs").select("*").eq("course_id", courseId),
    supabase.from("soil_moisture_readings").select("*").eq("course_id", courseId),
    supabase.from("monthly_reports").select("*").eq("course_id", courseId),
  ]);

  const equipmentIds = (equipment.data ?? []).map((e) => e.id as string);
  const [maintenanceScheduleItems, maintenanceLog] = equipmentIds.length
    ? await Promise.all([
        supabase.from("maintenance_schedule_items").select("*").in("equipment_id", equipmentIds),
        supabase.from("maintenance_log").select("*").in("equipment_id", equipmentIds),
      ])
    : [{ data: [] }, { data: [] }];

  return {
    exported_at: new Date().toISOString(),
    course: course.data,
    team: team.data,
    employees: employees.data,
    budget_categories: budgetCategories.data,
    expenses: expenses.data,
    fertility_programs: fertilityPrograms.data,
    fertilizer_applications: fertilizerApplications.data,
    soil_tests: soilTests.data,
    gdd_daily_log: gddDailyLog.data,
    disease_risk_daily_log: diseaseRiskDailyLog.data,
    task_templates: taskTemplates.data,
    task_assignments: taskAssignments.data,
    time_entries: timeEntries.data,
    equipment: equipment.data,
    maintenance_schedule_items: maintenanceScheduleItems.data,
    maintenance_log: maintenanceLog.data,
    pest_applications: pestApplications.data,
    irrigation_programs: irrigationPrograms.data,
    irrigation_logs: irrigationLogs.data,
    soil_moisture_readings: soilMoistureReadings.data,
    monthly_reports: monthlyReports.data,
  };
}
