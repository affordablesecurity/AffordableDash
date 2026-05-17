import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import nodemailer from "nodemailer";

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

function smtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM);
}

function resendConfigured() {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendEmail(input: SendEmailInput) {
  const emailFrom = env.EMAIL_FROM || "";
  if (!smtpConfigured() && !resendConfigured()) {
    return prisma.message.create({
      data: {
        locationId: input.locationId,
        customerId: input.customerId ?? undefined,
        jobId: input.jobId ?? undefined,
        invoiceId: input.invoiceId ?? undefined,
        direction: "OUTBOUND",
        fromNumber: emailFrom,
        toNumber: input.to,
        body: input.body,
        channel: "email",
        status: "FAILED",
        error: "Email provider is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in Render.",
        provider: "email",
        templateKey: input.templateKey
      }
    });
  }

  if (smtpConfigured()) {
    try {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_SECURE ?? false,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD
        }
      });
      const result = await transporter.sendMail({
        from: emailFrom,
        to: input.to,
        replyTo: env.EMAIL_REPLY_TO || undefined,
        subject: input.subject,
        text: input.body,
        html: htmlBody(input.body)
      });
      return prisma.message.create({
        data: {
          locationId: input.locationId,
          customerId: input.customerId ?? undefined,
          jobId: input.jobId ?? undefined,
          invoiceId: input.invoiceId ?? undefined,
          direction: "OUTBOUND",
          fromNumber: emailFrom,
          toNumber: input.to,
          body: input.body,
          channel: "email",
          status: "SENT",
          provider: "smtp",
          providerRef: result.messageId,
          templateKey: input.templateKey
        }
      });
    } catch (err) {
      return prisma.message.create({
        data: {
          locationId: input.locationId,
          customerId: input.customerId ?? undefined,
          jobId: input.jobId ?? undefined,
          invoiceId: input.invoiceId ?? undefined,
          direction: "OUTBOUND",
          fromNumber: emailFrom,
          toNumber: input.to,
          body: input.body,
          channel: "email",
          status: "FAILED",
          error: err instanceof Error ? err.message : "SMTP email failed.",
          provider: "smtp",
          templateKey: input.templateKey
        }
      });
    }
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: emailFrom,
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
      fromNumber: emailFrom,
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
