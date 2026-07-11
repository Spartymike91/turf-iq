export interface EquipmentLike {
  current_hours: number;
}

export interface ScheduleItemLike {
  equipment_id: string;
  task: string;
  interval_hours: number | null;
  interval_days: number | null;
}

export interface MaintenanceLogLike {
  equipment_id: string;
  task: string;
  performed_at: string;
  hours_at_service: number | null;
}

export interface DueStatus {
  status: "OVERDUE" | "DUE SOON" | "OK";
  hoursRemaining: number | null;
  daysRemaining: number | null;
  lastLog: MaintenanceLogLike | null;
}

export function getDueStatus(
  item: ScheduleItemLike,
  equipment: EquipmentLike,
  logs: MaintenanceLogLike[]
): DueStatus {
  const relevantLogs = logs
    .filter((l) => l.equipment_id === item.equipment_id && l.task === item.task)
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
  const lastLog = relevantLogs[0] ?? null;

  let hoursRemaining: number | null = null;
  if (item.interval_hours != null) {
    const lastHours = lastLog?.hours_at_service ?? 0;
    hoursRemaining = lastHours + item.interval_hours - equipment.current_hours;
  }

  let daysRemaining: number | null = null;
  if (item.interval_days != null) {
    const baseline = lastLog ? new Date(lastLog.performed_at).getTime() : Date.now();
    const dueDate = baseline + item.interval_days * 86400000;
    daysRemaining = Math.ceil((dueDate - Date.now()) / 86400000);
  }

  const overdue = (hoursRemaining != null && hoursRemaining < 0) || (daysRemaining != null && daysRemaining < 0);
  const dueSoon =
    !overdue && ((hoursRemaining != null && hoursRemaining <= 25) || (daysRemaining != null && daysRemaining <= 14));
  const status: DueStatus["status"] = overdue ? "OVERDUE" : dueSoon ? "DUE SOON" : "OK";

  return { status, hoursRemaining, daysRemaining, lastLog };
}
