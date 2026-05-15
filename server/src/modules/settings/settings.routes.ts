import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const settingsRouter = Router();

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getUTCDay());
}

function rangeBounds(range: string, selectedDate?: string) {
  const parsedDate = selectedDate ? new Date(`${selectedDate}T00:00:00.000Z`) : new Date();
  const anchor = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const today = startOfUtcDay(anchor);
  const tomorrow = addDays(today, 1);
  if (range === "selectedDay") return { start: today, end: tomorrow };
  if (range === "today") return { start: startOfUtcDay(new Date()), end: addDays(startOfUtcDay(new Date()), 1) };
  if (range === "weekToDate") return { start: startOfWeek(today), end: tomorrow };
  if (range === "quarterToDate") return { start: new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3, 1)), end: tomorrow };
  if (range === "yearToDate") return { start: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), end: tomorrow };
  if (range === "lastWeek") {
    const thisWeek = startOfWeek(today);
    return { start: addDays(thisWeek, -7), end: thisWeek };
  }
  if (range === "lastMonth") {
    const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { start: addMonths(thisMonth, -1), end: thisMonth };
  }
  if (range === "lastYear") return { start: addYears(new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), -1), end: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)) };
  return { start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), end: tomorrow };
}

settingsRouter.get("/summary", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const dateRange = typeof req.query.dateRange === "string" ? req.query.dateRange : "monthToDate";
  const selectedDate = typeof req.query.date === "string" ? req.query.date : undefined;
  const { start, end } = rangeBounds(dateRange, selectedDate);
  const createdInRange = { gte: start, lt: end };
  const scheduledInRange = { gte: start, lt: end };
  const completedInRange = { gte: start, lt: end };
  const [
    customers,
    openJobs,
    totalJobs,
    completedJobs,
    canceledJobs,
    leadJobs,
    bookedJobs,
    invoices,
    invoiceTotals,
    paidPayments,
    jobsByTypeRows,
    jobsBySourceRows
  ] = await Promise.all([
    prisma.customer.count({ where: { locationId, createdAt: createdInRange } }),
    prisma.job.count({ where: { locationId, status: { in: ["LEAD", "SCHEDULED", "DISPATCHED", "IN_PROGRESS"] } } }),
    prisma.job.count({ where: { locationId, createdAt: createdInRange } }),
    prisma.job.count({ where: { locationId, status: "COMPLETED", completedAt: completedInRange } }),
    prisma.job.count({ where: { locationId, status: "CANCELED", updatedAt: createdInRange } }),
    prisma.job.count({ where: { locationId, status: "LEAD", createdAt: createdInRange } }),
    prisma.job.count({ where: { locationId, status: { in: ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED"] }, createdAt: createdInRange } }),
    prisma.invoice.count({ where: { locationId, createdAt: createdInRange } }),
    prisma.invoice.aggregate({ where: { locationId, status: { not: "VOID" }, createdAt: createdInRange }, _sum: { total: true }, _avg: { total: true } }),
    prisma.payment.aggregate({
      where: {
        status: "SUCCEEDED",
        invoice: { locationId },
        OR: [{ paidAt: scheduledInRange }, { paidAt: null, createdAt: createdInRange }]
      },
      _sum: { amount: true }
    }),
    prisma.job.groupBy({ by: ["jobType"], where: { locationId, createdAt: createdInRange }, _count: { _all: true } }),
    prisma.job.groupBy({ by: ["leadSource"], where: { locationId, createdAt: createdInRange }, _count: { _all: true } })
  ]);

  const salesCents = invoiceTotals._sum.total ?? 0;
  const collectedCents = paidPayments._sum.amount ?? 0;
  const averageJobSizeCents = Math.round(invoiceTotals._avg.total ?? 0);
  const cancellationRate = totalJobs ? canceledJobs / totalJobs : 0;
  const bookingRate = totalJobs ? bookedJobs / totalJobs : 0;
  const closeRate = totalJobs ? completedJobs / totalJobs : 0;
  const jobsByType = jobsByTypeRows.map((row) => ({
    label: row.jobType,
    count: row._count._all,
    percent: totalJobs ? row._count._all / totalJobs : 0
  }));
  const jobsBySource = jobsBySourceRows.map((row) => ({
    label: row.leadSource || "Unknown",
    count: row._count._all,
    percent: totalJobs ? row._count._all / totalJobs : 0
  }));

  res.json({
    customers,
    openJobs,
    invoices,
    totalJobs,
    completedJobs,
    canceledJobs,
    leadJobs,
    bookedJobs,
    salesCents,
    collectedCents,
    revenueCents: collectedCents,
    averageJobSizeCents,
    cancellationRate,
    bookingRate,
    closeRate,
    estimateWinRatio: { won: completedJobs, total: invoices },
    jobsByType,
    jobsBySource,
    range: { start, end, dateRange }
  });
}));

const optionKinds = ["leadSource", "tag", "jobType", "jobField", "checklist", "servicePlan"] as const;

const optionSchema = z.object({
  kind: z.enum(optionKinds),
  name: z.string().trim().min(1)
});

const templateLineItemSchema = z.object({
  category: z.enum(["service", "material"]).default("service"),
  name: z.string().trim().min(1),
  description: z.string().optional().default(""),
  quantity: z.union([z.string(), z.number()]).transform((value) => String(value || "1")).default("1"),
  unitPrice: z.union([z.string(), z.number()]).transform((value) => String(value || "0")).default("0")
});

const jobTemplateSchema = z.object({
  name: z.string().trim().min(1),
  title: z.string().trim().min(1),
  jobType: z.string().trim().min(1),
  leadSource: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  privateNotes: z.string().optional().default(""),
  lineItems: z.array(templateLineItemSchema).default([])
});

const invoiceSettingsSchema = z.object({
  tab: z.enum(["configuration", "automation", "customerView", "delivery"]).default("configuration"),
  logoName: z.string().optional().default(""),
  logoDataUrl: z.string().optional().default(""),
  invoiceMessage: z.string().optional().default(""),
  defaultTermsType: z.enum(["uponReceipt", "net"]).default("uponReceipt"),
  defaultTermsDays: z.number().int().min(0).max(365).default(30),
  progressiveInvoicing: z.boolean().default(false),
  matchInvoiceAndJobNumber: z.boolean().default(false),
  includeImages: z.boolean().default(true),
  acceptCreditCard: z.boolean().default(true),
  saveCardOnFile: z.boolean().default(true),
  acceptAch: z.boolean().default(true),
  acceptTips: z.boolean().default(true),
  separateTippingScreen: z.boolean().default(true),
  autoReminders: z.boolean().default(false),
  reminderCadenceDays: z.number().int().min(1).max(30).default(1),
  maxReminders: z.number().int().min(1).max(30).default(10),
  autoChargeCard: z.boolean().default(false),
  showJobNumber: z.boolean().default(true),
  showInvoiceNumber: z.boolean().default(false),
  showServiceDate: z.boolean().default(true),
  showInvoiceDate: z.boolean().default(true),
  showSummaryOfWork: z.boolean().default(true),
  showBusinessName: z.boolean().default(true),
  showTechnicianName: z.boolean().default(true),
  showCustomerDisplayName: z.boolean().default(true),
  showCustomerCompanyName: z.boolean().default(true),
  showServiceLineItems: z.boolean().default(true),
  showServiceName: z.boolean().default(true),
  showServiceDescription: z.boolean().default(true),
  showServiceQuantity: z.boolean().default(true),
  showServiceUnitPrice: z.boolean().default(true),
  showServiceAmount: z.boolean().default(true),
  showMaterialLineItems: z.boolean().default(true),
  showMaterialName: z.boolean().default(true),
  showMaterialDescription: z.boolean().default(true),
  customerViewFormat: z.enum(["email", "envelope"]).default("email"),
  emailSubjectTemplate: z.string().default("Invoice {{invoiceNumber}} due from {{companyName}} - {{invoiceTotal}}"),
  emailBodyTemplate: z.string().default("Hi {{customerFirstName}},\n\nThank you for choosing {{companyName}}. Please see attached invoice due {{invoiceDueTerms}}."),
  smsTemplate: z.string().default("Invoice due from {{companyName}}"),
  reminderSubjectTemplate: z.string().default("Reminder: Invoice {{invoiceNumber}} is due from {{companyName}} - {{invoiceTotal}}"),
  reminderBodyTemplate: z.string().default("Hi {{customerFirstName}},\n\nThis is a friendly reminder from {{companyName}} that invoice {{invoiceNumber}} for {{invoiceTotal}} is due. Please see the attached invoice to review and pay.")
});

type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;

function defaultInvoiceSettings(existing?: unknown): InvoiceSettings {
  return invoiceSettingsSchema.parse(existing ?? {});
}

async function saveTemplateOptions(locationId: string, input: z.infer<typeof jobTemplateSchema>) {
  const optionWrites = [
    prisma.crmOption.upsert({
      where: { locationId_kind_name: { locationId, kind: "jobType", name: input.jobType } },
      create: { locationId, kind: "jobType", name: input.jobType },
      update: {}
    }),
    ...(input.leadSource ? [prisma.crmOption.upsert({
      where: { locationId_kind_name: { locationId, kind: "leadSource", name: input.leadSource } },
      create: { locationId, kind: "leadSource", name: input.leadSource },
      update: {}
    })] : []),
    ...input.tags.map((name) => prisma.crmOption.upsert({
      where: { locationId_kind_name: { locationId, kind: "tag", name } },
      create: { locationId, kind: "tag", name },
      update: {}
    }))
  ];
  await Promise.all(optionWrites);
}

settingsRouter.get("/options", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const [options, jobTypes, leadSources, jobTags] = await Promise.all([
    prisma.crmOption.findMany({ where: { locationId }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.job.findMany({ where: { locationId }, select: { jobType: true }, distinct: ["jobType"] }),
    prisma.job.findMany({ where: { locationId, leadSource: { not: null } }, select: { leadSource: true }, distinct: ["leadSource"] }),
    prisma.job.findMany({ where: { locationId }, select: { tags: true } })
  ]);

  const grouped = {
    leadSources: new Set<string>(["Unknown", "Online Booking", "Google Ads", "Facebook Ads", "Yelp Ads", "Referral", "Phone Call"]),
    tags: new Set<string>(),
    jobTypes: new Set<string>(["Car Lockout Service", "House Lockout Service", "Rekey", "Lock Install", "Car Key", "Ignition", "Safe", "Access Control"]),
    jobFields: new Set<string>(["Gate code", "Lock brand", "Key count", "Door condition", "Vehicle year/make/model"]),
    checklists: new Set<string>(["Arrival checklist", "Vehicle lockout checklist", "Rekey checklist", "Invoice review"]),
    servicePlans: new Set<string>(["Residential maintenance", "Commercial priority", "Property manager"])
  };

  options.forEach((option) => {
    if (option.kind === "leadSource") grouped.leadSources.add(option.name);
    if (option.kind === "tag") grouped.tags.add(option.name);
    if (option.kind === "jobType") grouped.jobTypes.add(option.name);
    if (option.kind === "jobField") grouped.jobFields.add(option.name);
    if (option.kind === "checklist") grouped.checklists.add(option.name);
    if (option.kind === "servicePlan") grouped.servicePlans.add(option.name);
  });
  jobTypes.forEach((row) => grouped.jobTypes.add(row.jobType));
  leadSources.forEach((row) => {
    if (row.leadSource) grouped.leadSources.add(row.leadSource);
  });
  jobTags.forEach((row) => row.tags.forEach((tag) => grouped.tags.add(tag)));

  res.json({
    leadSources: [...grouped.leadSources].sort(),
    tags: [...grouped.tags].sort(),
    jobTypes: [...grouped.jobTypes].sort(),
    jobFields: [...grouped.jobFields].sort(),
    checklists: [...grouped.checklists].sort(),
    servicePlans: [...grouped.servicePlans].sort()
  });
}));

settingsRouter.post("/options", asyncHandler(async (req, res) => {
  const input = optionSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const option = await prisma.crmOption.upsert({
    where: { locationId_kind_name: { locationId, kind: input.kind, name: input.name } },
    create: { locationId, kind: input.kind, name: input.name },
    update: {}
  });
  res.status(201).json({ option });
}));

settingsRouter.delete("/options", asyncHandler(async (req, res) => {
  const input = optionSchema.parse(req.body);
  const locationId = activeLocationId(req);
  await prisma.crmOption.deleteMany({
    where: { locationId, kind: input.kind, name: input.name }
  });
  res.status(204).send();
}));

settingsRouter.get("/invoice-settings", asyncHandler(async (req, res) => {
  const location = await prisma.location.findUniqueOrThrow({
    where: { id: activeLocationId(req) },
    select: { invoiceSettings: true, logoName: true, termsOfService: true }
  });
  const settings = defaultInvoiceSettings(location.invoiceSettings);
  if (!settings.logoName && location.logoName) settings.logoName = location.logoName;
  if (!settings.invoiceMessage && location.termsOfService) settings.invoiceMessage = location.termsOfService;
  res.json({ settings });
}));

settingsRouter.patch("/invoice-settings", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can update invoice settings" });
  }
  const current = await prisma.location.findUniqueOrThrow({
    where: { id: activeLocationId(req) },
    select: { invoiceSettings: true }
  });
  const settings = invoiceSettingsSchema.parse({
    ...defaultInvoiceSettings(current.invoiceSettings),
    ...req.body
  });
  const location = await prisma.location.update({
    where: { id: activeLocationId(req) },
    data: { invoiceSettings: settings as Prisma.InputJsonValue },
    select: { invoiceSettings: true }
  });
  res.json({ settings: defaultInvoiceSettings(location.invoiceSettings) });
}));

settingsRouter.get("/job-templates", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const templates = await prisma.jobTemplate.findMany({
    where: { locationId },
    orderBy: { name: "asc" }
  });
  res.json({ templates });
}));

settingsRouter.post("/job-templates", asyncHandler(async (req, res) => {
  const input = jobTemplateSchema.parse(req.body);
  const locationId = activeLocationId(req);
  await saveTemplateOptions(locationId, input);
  const template = await prisma.jobTemplate.upsert({
    where: { locationId_name: { locationId, name: input.name } },
    create: {
      locationId,
      name: input.name,
      title: input.title,
      jobType: input.jobType,
      leadSource: input.leadSource || null,
      tags: [...new Set(input.tags)],
      privateNotes: input.privateNotes,
      lineItems: input.lineItems
    },
    update: {
      title: input.title,
      jobType: input.jobType,
      leadSource: input.leadSource || null,
      tags: [...new Set(input.tags)],
      privateNotes: input.privateNotes,
      lineItems: input.lineItems
    }
  });
  res.status(201).json({ template });
}));

settingsRouter.patch("/job-templates/:id", asyncHandler(async (req, res) => {
  const input = jobTemplateSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const templateId = String(req.params.id);
  await saveTemplateOptions(locationId, input);
  await prisma.jobTemplate.updateMany({
    where: { id: templateId, locationId },
    data: {
      name: input.name,
      title: input.title,
      jobType: input.jobType,
      leadSource: input.leadSource || null,
      tags: [...new Set(input.tags)],
      privateNotes: input.privateNotes,
      lineItems: input.lineItems
    }
  });
  const template = await prisma.jobTemplate.findFirstOrThrow({ where: { id: templateId, locationId } });
  res.json({ template });
}));

settingsRouter.delete("/job-templates/:id", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const templateId = String(req.params.id);
  await prisma.jobTemplate.deleteMany({ where: { id: templateId, locationId } });
  res.status(204).send();
}));
