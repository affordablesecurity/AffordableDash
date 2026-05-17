import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";

type SendEmailInput = {
  locationId: string;
  customerId?: string | null;
  jobId?: string | null;
  invoiceId?: string | null;
  to: string;
  subject: string;
  body: string;
  templateKey: string;
};

function htmlBody(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .split(/\r?\n/)
    .map((line) => line.trim() ? `<p>${line}</p>` : "<br />")
    .join("");
}

export async function sendEmail(input: SendEmailInput) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return prisma.message.create({
      data: {
        locationId: input.locationId,
        customerId: input.customerId ?? undefined,
        jobId: input.jobId ?? undefined,
        invoiceId: input.invoiceId ?? undefined,
        direction: "OUTBOUND",
        fromNumber: env.EMAIL_FROM || "",
        toNumber: input.to,
        body: input.body,
        channel: "email",
        status: "FAILED",
        error: "Email provider is not configured. Add RESEND_API_KEY and EMAIL_FROM in Render.",
        provider: "resend",
        templateKey: input.templateKey
      }
    });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: htmlBody(input.body),
      reply_to: env.EMAIL_REPLY_TO || undefined
    })
  });
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: string };
  const error = response.ok ? undefined : result.message || result.error || `Resend returned ${response.status}`;

  return prisma.message.create({
    data: {
      locationId: input.locationId,
      customerId: input.customerId ?? undefined,
      jobId: input.jobId ?? undefined,
      invoiceId: input.invoiceId ?? undefined,
      direction: "OUTBOUND",
      fromNumber: env.EMAIL_FROM,
      toNumber: input.to,
      body: input.body,
      channel: "email",
      status: response.ok ? "SENT" : "FAILED",
      error,
      provider: "resend",
      providerRef: result.id,
      templateKey: input.templateKey
    }
  });
}
