import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localToday, pushTaskToAssignee } from "@/lib/taskNotify";

// Morning heads-up for tasks scheduled ahead of time: anything assigned to
// someone, dated today, not finished, and not already announced today (an
// assignment made or edited today already pushed at that moment). Triggered
// by an external cron (cron-job.org, not Vercel Cron — the Hobby plan's two
// cron slots are taken, see the soil-temp trigger) with the shared
// CRON_SECRET, same as the other cron routes.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const today = localToday();
  const { data: tasks, error } = await adminClient
    .from("task_assignments")
    .select("id")
    .eq("scheduled_date", today)
    .not("assigned_to", "is", null)
    .neq("status", "complete")
    .or(`notified_for_date.is.null,notified_for_date.neq.${today}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const t of tasks ?? []) {
    const result = await pushTaskToAssignee(adminClient, t.id as string, "today");
    if (result.sent) sent++;
  }
  return NextResponse.json({ date: today, candidates: tasks?.length ?? 0, sent });
}
