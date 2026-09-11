import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasModulePermission } from "@/lib/planAccess";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("VAPID env vars are not configured.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

// Best-effort fan-out to every device a course member has subscribed on.
// Never throws — a push failure should never break the chat send flow that
// triggers it. A 404/410 from the push service means that subscription is
// permanently gone (uninstalled, revoked, browser data cleared) and gets
// deleted; other failures (429 rate-limited, 5xx transient) are left alone
// since the subscription may still be valid.
export async function sendPushToCourseMember(
  adminClient: SupabaseClient,
  courseMemberId: string,
  payload: PushPayload
) {
  try {
    ensureConfigured();
  } catch {
    return; // VAPID not configured yet — silently skip, chat still works without push.
  }

  const { data: subscriptions } = await adminClient
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("course_member_id", courseMemberId);
  if (!subscriptions || subscriptions.length === 0) return;

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  );

  const staleIds: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) staleIds.push(subscriptions[i].id);
    }
  });
  if (staleIds.length > 0) {
    await adminClient.from("push_subscriptions").delete().in("id", staleIds);
  }
}

interface ThreadForNotify {
  kind: "general" | "dm";
  participant_1_id: string | null;
  participant_2_id: string | null;
}

// Fan out a new chat message to everyone who should be pushed about it —
// the other DM participant, or every other course member for the general
// channel, filtered through the same allowed_modules chat permission the
// nav/page already enforce so a restricted crew member isn't pushed to a
// page they can't open. Never the sender's own devices.
export async function notifyNewMessage(
  adminClient: SupabaseClient,
  params: {
    threadId: string;
    thread: ThreadForNotify;
    courseId: string;
    senderId: string;
    senderName: string;
    body: string;
  }
) {
  const { threadId, thread, courseId, senderId, senderName, body } = params;

  let targetIds: string[] = [];
  if (thread.kind === "dm") {
    targetIds = [thread.participant_1_id, thread.participant_2_id].filter(
      (id): id is string => !!id && id !== senderId
    );
  } else {
    const { data: members } = await adminClient
      .from("course_members")
      .select("id, allowed_modules")
      .eq("course_id", courseId);
    targetIds = (members ?? [])
      .filter((m) => m.id !== senderId && hasModulePermission(m.allowed_modules, "/chat"))
      .map((m) => m.id);
  }
  if (targetIds.length === 0) return;

  const payload = {
    title: thread.kind === "general" ? `${senderName} in General` : senderName,
    body: body.length > 150 ? `${body.slice(0, 150)}…` : body,
    url: "/chat",
    tag: threadId,
  };
  await Promise.allSettled(targetIds.map((id) => sendPushToCourseMember(adminClient, id, payload)));
}
