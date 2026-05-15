import { InvoiceStatus, type Customer, type IntegrationCredential } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { sendSms } from "./voipms.service.js";

export type MessagingTemplateKey =
  | "appointmentScheduled"
  | "onMyWay"
  | "workStarted"
  | "jobCompleted"
  | "invoiceSent"
  | "paymentReceived";

export type MessagingSettings = {
  smsEnabled: boolean;
  username: string;
  apiPassword: string;
  defaultDid: string;
  areaCode: string;
  availableDids: string[];
  autoSend: Record<MessagingTemplateKey, boolean>;
  templates: Record<MessagingTemplateKey, string>;
  reviewEmail: {
    enabled: boolean;
    subject: string;
    body: string;
  };
};

export type MessagingSettingsInput = Partial<Omit<MessagingSettings, "autoSend" | "templates" | "reviewEmail">> & {
  autoSend?: Partial<Record<MessagingTemplateKey, boolean>>;
  templates?: Partial<Record<MessagingTemplateKey, string>>;
  reviewEmail?: Partial<MessagingSettings["reviewEmail"]>;
};

type MessagingMetadata = Partial<MessagingSettings>;

const provider = "voipms";
const maskedPassword = "********";

export const defaultTemplates: Record<MessagingTemplateKey, string> = {
  appointmentScheduled: "Hi {{customerFirstName}}, your appointment with {{companyName}} is scheduled for {{scheduledWindow}}. Reply STOP to opt out.",
  onMyWay: "Hi {{customerFirstName}}, {{technicianName}} is on the way for job #{{jobNumber}} with {{companyName}}.",
  workStarted: "Hi {{customerFirstName}}, work has started on job #{{jobNumber}}.",
  jobCompleted: "Hi {{customerFirstName}}, job #{{jobNumber}} has been completed. Thank you for choosing {{companyName}}.",
  invoiceSent: "Hi {{customerFirstName}}, invoice #{{invoiceNumber}} for {{invoiceTotal}} from {{companyName}} is ready.",
  paymentReceived: "Hi {{customerFirstName}}, payment of {{paymentAmount}} was received. Thank you for choosing {{companyName}}."
};

const defaultAutoSend: Record<MessagingTemplateKey, boolean> = {
  appointmentScheduled: true,
  onMyWay: true,
  workStarted: true,
  jobCompleted: true,
  invoiceSent: true,
  paymentReceived: true
};

export function defaultMessagingSettings(): MessagingSettings {
  return {
    smsEnabled: Boolean(env.VOIPMS_USERNAME && env.VOIPMS_API_PASSWORD && env.VOIPMS_DID),
    username: env.VOIPMS_USERNAME ?? "",
    apiPassword: env.VOIPMS_API_PASSWORD ?? "",
    defaultDid: env.VOIPMS_DID ?? "",
    areaCode: "",
    availableDids: env.VOIPMS_DID ? [env.VOIPMS_DID] : [],
    autoSend: { ...defaultAutoSend },
    templates: { ...defaultTemplates },
    reviewEmail: {
      enabled: true,
      subject: "How was your service with {{companyName}}?",
      body: "Hi {{customerFirstName}}, thank you for choosing {{companyName}}. We would appreciate it if you could leave us a review."
    }
  };
}

function metadataFromCredential(credential: IntegrationCredential | null): MessagingMetadata {
  if (!credential?.metadata || typeof credential.metadata !== "object" || Array.isArray(credential.metadata)) return {};
  return credential.metadata as MessagingMetadata;
}

function mergeSettings(metadata: MessagingMetadata = {}): MessagingSettings {
  const defaults = defaultMessagingSettings();
  return {
    ...defaults,
    ...metadata,
    availableDids: Array.isArray(metadata.availableDids) ? metadata.availableDids : defaults.availableDids,
    autoSend: { ...defaults.autoSend, ...(metadata.autoSend ?? {}) },
    templates: { ...defaults.templates, ...(metadata.templates ?? {}) },
    reviewEmail: { ...defaults.reviewEmail, ...(metadata.reviewEmail ?? {}) }
  };
}

export async function getMessagingSettings(locationId: string, maskSecret = true) {
  const credential = await prisma.integrationCredential.findUnique({
    where: { locationId_provider: { locationId, provider } }
  });
  const settings = mergeSettings(metadataFromCredential(credential));
  return {
    ...settings,
    apiPassword: maskSecret && settings.apiPassword ? maskedPassword : settings.apiPassword
  };
}

export async function saveMessagingSettings(locationId: string, input: MessagingSettingsInput) {
  const credential = await prisma.integrationCredential.findUnique({
    where: { locationId_provider: { locationId, provider } }
  });
  const existing = mergeSettings(metadataFromCredential(credential));
  const apiPassword = !input.apiPassword || input.apiPassword === maskedPassword
    ? existing.apiPassword
    : input.apiPassword;
  const settings = mergeSettings({
    ...existing,
    ...input,
    apiPassword,
    availableDids: input.availableDids ?? existing.availableDids,
    autoSend: { ...existing.autoSend, ...(input.autoSend ?? {}) },
    templates: { ...existing.templates, ...(input.templates ?? {}) },
    reviewEmail: { ...existing.reviewEmail, ...(input.reviewEmail ?? {}) }
  });

  await prisma.integrationCredential.upsert({
    where: { locationId_provider: { locationId, provider } },
    create: {
      locationId,
      provider,
      enabled: settings.smsEnabled,
      metadata: settings
    },
    update: {
      enabled: settings.smsEnabled,
      metadata: settings
    }
  });

  return getMessagingSettings(locationId);
}

function dollars(cents?: number | null) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function renderTemplate(template: string, context: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => context[key] ?? "");
}

function customerAllowsSms(customer?: Pick<Customer, "communicationPrefs"> | null) {
  const prefs = customer?.communicationPrefs;
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return true;
  return (prefs as { sms?: boolean }).sms !== false;
}

async function createMessage(data: {
  locationId: string;
  customerId?: string | null;
  jobId?: string | null;
  invoiceId?: string | null;
  direction?: "INBOUND" | "OUTBOUND";
  fromNumber: string;
  toNumber: string;
  body: string;
  channel?: string;
  status?: string;
  error?: string;
  templateKey?: string;
  attachments?: string[];
  provider?: string;
  providerRef?: string;
}) {
  return prisma.message.create({
    data: {
      locationId: data.locationId,
      customerId: data.customerId ?? undefined,
      jobId: data.jobId ?? undefined,
      invoiceId: data.invoiceId ?? undefined,
      direction: data.direction ?? "OUTBOUND",
      fromNumber: data.fromNumber,
      toNumber: data.toNumber,
      body: data.body,
      channel: data.channel ?? "sms",
      status: data.status ?? "SENT",
      error: data.error,
      templateKey: data.templateKey,
      attachments: data.attachments ?? [],
      provider: data.provider ?? provider,
      providerRef: data.providerRef
    }
  });
}

export async function sendLocationSms(input: {
  locationId: string;
  customerId?: string | null;
  jobId?: string | null;
  invoiceId?: string | null;
  to: string;
  body: string;
  templateKey?: string;
  attachments?: string[];
  customer?: Pick<Customer, "communicationPrefs"> | null;
}) {
  const settings = await getMessagingSettings(input.locationId, false);
  const fromNumber = settings.defaultDid || env.VOIPMS_DID || "";

  if (!settings.smsEnabled || !settings.username || !settings.apiPassword || !settings.defaultDid) {
    return createMessage({
      locationId: input.locationId,
      customerId: input.customerId,
      jobId: input.jobId,
      invoiceId: input.invoiceId,
      fromNumber,
      toNumber: input.to,
      body: input.body,
      status: "FAILED",
      error: "VoIP.ms SMS is not configured for this location.",
      templateKey: input.templateKey,
      attachments: input.attachments
    });
  }

  if (!input.to) {
    return createMessage({
      locationId: input.locationId,
      customerId: input.customerId,
      jobId: input.jobId,
      invoiceId: input.invoiceId,
      fromNumber,
      toNumber: "",
      body: input.body,
      status: "FAILED",
      error: "Customer has no phone number for SMS.",
      templateKey: input.templateKey,
      attachments: input.attachments
    });
  }

  if (!customerAllowsSms(input.customer)) {
    return createMessage({
      locationId: input.locationId,
      customerId: input.customerId,
      jobId: input.jobId,
      invoiceId: input.invoiceId,
      fromNumber,
      toNumber: input.to,
      body: input.body,
      status: "SKIPPED",
      error: "Customer has opted out of text messages.",
      templateKey: input.templateKey,
      attachments: input.attachments
    });
  }

  try {
    const result = await sendSms(input.to, input.body, {
      username: settings.username,
      apiPassword: settings.apiPassword,
      did: settings.defaultDid
    });
    return createMessage({
      locationId: input.locationId,
      customerId: input.customerId,
      jobId: input.jobId,
      invoiceId: input.invoiceId,
      fromNumber,
      toNumber: input.to,
      body: input.body,
      status: "SENT",
      templateKey: input.templateKey,
      attachments: input.attachments,
      providerRef: typeof result.sms === "string" ? result.sms : undefined
    });
  } catch (err) {
    return createMessage({
      locationId: input.locationId,
      customerId: input.customerId,
      jobId: input.jobId,
      invoiceId: input.invoiceId,
      fromNumber,
      toNumber: input.to,
      body: input.body,
      status: "FAILED",
      error: err instanceof Error ? err.message : "SMS failed",
      templateKey: input.templateKey,
      attachments: input.attachments
    });
  }
}

function scheduledWindow(start?: Date | null, end?: Date | null) {
  if (!start) return "soon";
  const date = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" });
  const endTime = end?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Phoenix" });
  return endTime ? `${date} ${startTime} - ${endTime}` : `${date} ${startTime}`;
}

async function jobContext(locationId: string, jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, locationId },
    include: {
      customer: true,
      technician: true,
      location: true,
      invoices: { orderBy: { createdAt: "asc" }, take: 1 }
    }
  });
  if (!job) return null;
  const invoice = job.invoices[0];
  return {
    job,
    invoice,
    context: {
      customerFirstName: job.customer.firstName || job.customer.companyName || "there",
      customerName: `${job.customer.firstName} ${job.customer.lastName}`.trim() || job.customer.companyName || "Customer",
      companyName: job.location.name,
      jobNumber: String(job.jobNumber),
      jobTitle: job.title,
      technicianName: job.technician?.name ?? "your technician",
      scheduledWindow: scheduledWindow(job.scheduledStart, job.scheduledEnd),
      jobTotal: dollars(invoice?.total ?? 0),
      invoiceNumber: invoice ? String(invoice.invoiceNumber) : "",
      invoiceTotal: dollars(invoice?.total ?? 0),
      paymentAmount: dollars(invoice?.total ?? 0)
    }
  };
}

export async function sendJobTemplateSms(locationId: string, jobId: string, templateKey: Exclude<MessagingTemplateKey, "invoiceSent" | "paymentReceived">) {
  const settings = await getMessagingSettings(locationId, false);
  if (!settings.autoSend[templateKey]) return null;
  const loaded = await jobContext(locationId, jobId);
  if (!loaded) return null;
  const body = renderTemplate(settings.templates[templateKey], loaded.context);
  return sendLocationSms({
    locationId,
    customerId: loaded.job.customerId,
    jobId: loaded.job.id,
    invoiceId: loaded.invoice?.id,
    to: loaded.job.customer.phone,
    body,
    templateKey,
    customer: loaded.job.customer
  });
}

export async function queueReviewEmailForJob(locationId: string, jobId: string) {
  const settings = await getMessagingSettings(locationId, false);
  if (!settings.reviewEmail.enabled) return null;
  const loaded = await jobContext(locationId, jobId);
  if (!loaded?.job.customer.email) return null;
  const body = renderTemplate(settings.reviewEmail.body, loaded.context);
  return createMessage({
    locationId,
    customerId: loaded.job.customerId,
    jobId: loaded.job.id,
    invoiceId: loaded.invoice?.id,
    fromNumber: "",
    toNumber: loaded.job.customer.email,
    body,
    channel: "email",
    status: "QUEUED",
    provider: "email",
    templateKey: "reviewRequestEmail"
  });
}

export async function sendInvoiceTemplateSms(locationId: string, invoiceId: string, toOverride?: string, bodyOverride?: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, locationId },
    include: { customer: true, location: true, job: true }
  });
  if (!invoice) return null;
  const settings = await getMessagingSettings(locationId, false);
  if (!settings.autoSend.invoiceSent && !bodyOverride) return null;
  const context = {
    customerFirstName: invoice.customer.firstName || invoice.customer.companyName || "there",
    customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim() || invoice.customer.companyName || "Customer",
    companyName: invoice.location.name,
    jobNumber: invoice.job ? String(invoice.job.jobNumber) : "",
    invoiceNumber: String(invoice.invoiceNumber),
    invoiceTotal: dollars(invoice.total),
    paymentAmount: dollars(invoice.total),
    scheduledWindow: invoice.job ? scheduledWindow(invoice.job.scheduledStart, invoice.job.scheduledEnd) : ""
  };
  return sendLocationSms({
    locationId,
    customerId: invoice.customerId,
    jobId: invoice.jobId,
    invoiceId: invoice.id,
    to: toOverride || invoice.customer.phone,
    body: bodyOverride || renderTemplate(settings.templates.invoiceSent, context),
    templateKey: "invoiceSent",
    customer: invoice.customer
  });
}

export async function queueInvoiceEmail(locationId: string, invoiceId: string, to: string, body: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, locationId }, include: { location: true } });
  if (!invoice) return null;
  return createMessage({
    locationId,
    customerId: invoice.customerId,
    jobId: invoice.jobId,
    invoiceId: invoice.id,
    fromNumber: "",
    toNumber: to,
    body,
    channel: "email",
    status: "QUEUED",
    provider: "email",
    templateKey: "invoiceSentEmail"
  });
}

export async function sendPaymentReceiptSms(locationId: string, invoiceId: string, amount?: number) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, locationId },
    include: { customer: true, location: true, job: true }
  });
  if (!invoice) return null;
  const settings = await getMessagingSettings(locationId, false);
  if (!settings.autoSend.paymentReceived) return null;
  const context = {
    customerFirstName: invoice.customer.firstName || invoice.customer.companyName || "there",
    customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim() || invoice.customer.companyName || "Customer",
    companyName: invoice.location.name,
    jobNumber: invoice.job ? String(invoice.job.jobNumber) : "",
    invoiceNumber: String(invoice.invoiceNumber),
    invoiceTotal: dollars(invoice.total),
    paymentAmount: dollars(amount ?? invoice.total),
    scheduledWindow: invoice.job ? scheduledWindow(invoice.job.scheduledStart, invoice.job.scheduledEnd) : ""
  };
  return sendLocationSms({
    locationId,
    customerId: invoice.customerId,
    jobId: invoice.jobId,
    invoiceId: invoice.id,
    to: invoice.customer.phone,
    body: renderTemplate(settings.templates.paymentReceived, context),
    templateKey: "paymentReceived",
    customer: invoice.customer
  });
}

export async function markInvoiceSent(invoiceId: string) {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: InvoiceStatus.SENT }
  });
}

export function normalizePhoneForLookup(phone: string) {
  return phone.replace(/\D/g, "");
}
