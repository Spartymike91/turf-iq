// Sends transactional email directly through Resend's API rather than
// relying on Supabase Auth's built-in SMTP dispatch — Supabase's SMTP
// connection to Resend was confirmed broken (a direct Resend API call with
// the same key/domain succeeds instantly; Supabase's relay to it does not,
// on both port 465 and 587), while Resend's own API works reliably.

import { type Role, ROLE_LABEL } from "@/lib/roles";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "TurfIQ <noreply@turfiq.club>";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
}

export function inviteEmailHtml({
  courseName,
  role,
  actionLink,
}: {
  courseName: string;
  role: Role;
  actionLink: string;
}): string {
  const roleLabel = ROLE_LABEL[role];
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: #1a3a2a; padding: 24px; border-radius: 10px 10px 0 0;">
        <div style="color: #ffffff; font-size: 20px; font-weight: 600;">Turf<span style="color: #52b788;">IQ</span></div>
      </div>
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 32px 24px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #1a1a1a; margin: 0 0 16px;">
          You've been invited to join <strong>${courseName}</strong> on TurfIQ as
          <strong>${roleLabel}</strong>.
        </p>
        <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px;">
          Click below to set up your account and get started.
        </p>
        <a href="${actionLink}"
           style="display: inline-block; background: #52b788; color: #1a3a2a; font-weight: 600; font-size: 15px; padding: 12px 28px; border-radius: 8px; text-decoration: none;">
          Accept Invite
        </a>
        <p style="font-size: 12px; color: #9ca3af; margin: 24px 0 0;">
          If you weren't expecting this invite, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}
