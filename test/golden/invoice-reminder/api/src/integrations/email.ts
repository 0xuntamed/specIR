// @appspec:generated — do not edit
import { env } from "../env.js";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
};

// Sends through Resend's HTTP API. With an idempotencyKey, a retried send
// returns the original result instead of emailing twice.
export async function sendEmail(message: EmailMessage, options: { idempotencyKey?: string } = {}): Promise<{ id: string }> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set to send email");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  return (await response.json()) as { id: string };
}
