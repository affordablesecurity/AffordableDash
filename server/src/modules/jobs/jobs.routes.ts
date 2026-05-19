import { InvoiceStatus, JobStatus } from "@prisma/client";
import { raw, Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { queueReviewEmailForJob, sendJobTemplateSms } from "../messaging/messaging.service.js";

export const jobsRouter = Router();

const jobSchema = z.object({
  customerId: z.string(),
  addressId: z.string().optional(),
  technicianId: z.string().nullable().optional(),
  title: z.string().min(1),
  jobType: z.string().min(1),
  leadSource: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: z.nativeEnum(JobStatus).optional(),
  priority: z.string().default("normal"),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  description: z.string().optional(),
  internalNotes: z.string().optional(),
  attachments: z.array(z.string()).default([]),
  lineItems: z.array(z.object({
    category: z.enum(["service", "material"]).default("service"),
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().int().default(0),
    unitCost: z.number().int().default(0),
    taxable: z.boolean().default(true)
  })).default([])
});

const jobInclude = {
  customer: { include: { addresses: true } },
  address: true,
  technician: true,
  notes: { orderBy: { createdAt: "desc" as const } },
  lineItems: true,
  invoices: { include: { payments: true } }
};

const lineItemSchema = z.object({
  category: z.enum(["service", "material"]).default("service"),
  name: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().int().default(0),
  unitCost: z.number().int().default(0),
  taxable: z.boolean().default(true)
});

async function findLocationJob(jobId: string, locationId: string) {
  return prisma.job.findFirst({ where: { id: jobId, locationId } });
}

function jobLineAmount(lineItem: { quantity: unknown; unitPrice: number }) {
  return Math.round(Number(lineItem.quantity || 0) * lineItem.unitPrice);
}

async function syncJobInvoices(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { lineItems: true, invoices: true }
  });
  if (!job) return;

  const subtotal = job.lineItems.reduce((sum, item) => sum + jobLineAmount(item), 0);
  const taxableSubtotal = job.lineItems.reduce((sum, item) => {
    if (item.category !== "material" || item.taxable === false) return sum;
    return sum + jobLineAmount(item);
  }, 0);
  const tax = Math.round(taxableSubtotal * 0.094);
  const total = subtotal + tax;
  const invoicesToSync = job.invoices.filter((invoice) => invoice.status !== InvoiceStatus.PAID);

  await Promise.all(invoicesToSync.map((invoice) => prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      subtotal,
      tax,
      total,
      items: {
        deleteMany: {},
        create: job.lineItems.map((item) => ({
          category: item.category,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxable: item.category === "material" && item.taxable !== false
        }))
      }
    }
  })));
}

async function getJobResponse(jobId: string, locationId: string) {
  return prisma.job.findFirst({
    where: { id: jobId, locationId },
    include: jobInclude
  });
}

const jobMediaUpload = raw({ type: "*/*", limit: "12mb" });

function jobMediaMimeType(value: unknown, fallback: unknown) {
  const mimeType = typeof value === "string" && value.trim() ? value.trim() : String(fallback ?? "");
  return mimeType || "application/octet-stream";
}

function isAllowedJobMedia(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

jobsRouter.get("/", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status as JobStatus : undefined;
  const locationId = activeLocationId(req);
  const jobs = await prisma.job.findMany({
    where: { locationId, ...(status ? { status } : {}) },
    include: jobInclude,
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
    take: 1000
  });
  res.json({ jobs });
}));

jobsRouter.post("/", asyncHandler(async (req, res) => {
  const input = jobSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const optionNames = [
    { kind: "jobType", name: input.jobType },
    ...(input.leadSource ? [{ kind: "leadSource", name: input.leadSource }] : []),
    ...input.tags.map((name) => ({ kind: "tag", name }))
  ];
  const job = await prisma.job.create({
    data: {
      customerId: input.customerId,
      addressId: input.addressId,
      technicianId: input.technicianId,
      title: input.title,
      jobType: input.jobType,
      leadSource: input.leadSource,
      tags: input.tags,
      status: input.status,
      priority: input.priority,
      description: input.description,
      internalNotes: input.internalNotes,
      attachments: input.attachments,
      locationId,
      scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
      scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined,
      lineItems: input.lineItems.length ? { create: input.lineItems } : undefined
    },
    include: jobInclude
  });
  if (optionNames.length) {
    await Promise.all(optionNames.map((option) => prisma.crmOption.upsert({
      where: { locationId_kind_name: { locationId, kind: option.kind, name: option.name } },
      create: { locationId, kind: option.kind, name: option.name },
      update: {}
    })));
  }
  if (job.scheduledStart) {
    await sendJobTemplateSms(locationId, job.id, "appointmentScheduled");
  }
  res.status(201).json({ job });
}));

jobsRouter.get("/:id", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const job = await prisma.job.findFirst({
    where: { id: jobId, locationId: activeLocationId(req) },
    include: jobInclude
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
}));

jobsRouter.post("/:id/media", jobMediaUpload, asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const locationId = activeLocationId(req);
  const existing = await findLocationJob(jobId, locationId);
  if (!existing) return res.status(404).json({ error: "Job not found" });

  const mimeType = jobMediaMimeType(req.query.type, req.headers["content-type"]);
  if (!isAllowedJobMedia(mimeType)) {
    return res.status(422).json({ error: "Job media must be an image or video file." });
  }

  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (!buffer.length) return res.status(400).json({ error: "No media file was received." });

  const attachment = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const job = await prisma.job.update({
    where: { id: jobId },
    data: { attachments: [...(existing.attachments ?? []), attachment] },
    include: jobInclude
  });
  res.status(201).json({ job });
}));

jobsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const locationId = activeLocationId(req);
  const input = jobSchema.partial().parse(req.body);
  const { lineItems: _lineItems, ...jobInput } = input;
  const existing = await prisma.job.findFirst({ where: { id: jobId, locationId } });
  if (!existing) return res.status(404).json({ error: "Job not found" });
  const scheduleChanged = "scheduledStart" in input
    && Boolean(input.scheduledStart)
    && (!existing.scheduledStart || new Date(input.scheduledStart as string).getTime() !== existing.scheduledStart.getTime());
  const statusChanged = Boolean(input.status && input.status !== existing.status);
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      ...jobInput,
      scheduledStart: "scheduledStart" in input ? (input.scheduledStart ? new Date(input.scheduledStart) : null) : undefined,
      scheduledEnd: "scheduledEnd" in input ? (input.scheduledEnd ? new Date(input.scheduledEnd) : null) : undefined,
      completedAt: input.status === JobStatus.COMPLETED && !existing.completedAt ? new Date() : undefined
    },
    include: jobInclude
  });
  const notifications: Array<Promise<unknown>> = [];
  if (scheduleChanged) notifications.push(sendJobTemplateSms(locationId, job.id, "appointmentScheduled"));
  if (statusChanged) {
    if (input.status === JobStatus.DISPATCHED) notifications.push(sendJobTemplateSms(locationId, job.id, "onMyWay"));
    if (input.status === JobStatus.IN_PROGRESS) notifications.push(sendJobTemplateSms(locationId, job.id, "workStarted"));
    if (input.status === JobStatus.COMPLETED) {
      notifications.push(sendJobTemplateSms(locationId, job.id, "jobCompleted"));
      notifications.push(queueReviewEmailForJob(locationId, job.id));
    }
  }
  if (notifications.length) await Promise.allSettled(notifications);
  res.json({ job });
}));

jobsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const locationId = activeLocationId(req);
  const job = await prisma.job.findFirst({
    where: { id: jobId, locationId },
    include: { invoices: { include: { payments: true } } }
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.invoices.some((invoice) => invoice.status === InvoiceStatus.PAID || invoice.payments.some((payment) => payment.status === "SUCCEEDED"))) {
    return res.status(422).json({ error: "Jobs with paid invoices cannot be deleted. Cancel the job instead." });
  }
  await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({ where: { jobId }, data: { jobId: null } });
    await tx.job.delete({ where: { id: jobId } });
  });
  res.status(204).send();
}));

jobsRouter.post("/:id/notes", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const input = z.object({ author: z.string().default("Office"), content: z.string().min(1) }).parse(req.body);
  const job = await prisma.job.findFirst({ where: { id: jobId, locationId: activeLocationId(req) } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const note = await prisma.jobNote.create({ data: { jobId, ...input } });
  res.status(201).json({ note });
}));

jobsRouter.post("/:id/line-items", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const locationId = activeLocationId(req);
  const input = lineItemSchema.parse(req.body);
  const job = await findLocationJob(jobId, locationId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  await prisma.jobLineItem.create({ data: { jobId, ...input } });
  await syncJobInvoices(jobId);
  const updatedJob = await getJobResponse(jobId, locationId);
  res.status(201).json({ job: updatedJob });
}));

jobsRouter.patch("/:id/line-items/:lineItemId", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const lineItemId = String(req.params.lineItemId);
  const locationId = activeLocationId(req);
  const input = lineItemSchema.partial().parse(req.body);
  const job = await findLocationJob(jobId, locationId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const lineItem = await prisma.jobLineItem.findFirst({ where: { id: lineItemId, jobId } });
  if (!lineItem) return res.status(404).json({ error: "Line item not found" });
  await prisma.jobLineItem.update({ where: { id: lineItemId }, data: input });
  await syncJobInvoices(jobId);
  const updatedJob = await getJobResponse(jobId, locationId);
  res.json({ job: updatedJob });
}));

jobsRouter.delete("/:id/line-items/:lineItemId", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const lineItemId = String(req.params.lineItemId);
  const locationId = activeLocationId(req);
  const job = await findLocationJob(jobId, locationId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const lineItem = await prisma.jobLineItem.findFirst({ where: { id: lineItemId, jobId } });
  if (!lineItem) return res.status(404).json({ error: "Line item not found" });
  await prisma.jobLineItem.delete({ where: { id: lineItemId } });
  await syncJobInvoices(jobId);
  const updatedJob = await getJobResponse(jobId, locationId);
  res.json({ job: updatedJob });
}));
