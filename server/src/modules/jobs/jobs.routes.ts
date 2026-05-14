import { JobStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const jobsRouter = Router();

const jobSchema = z.object({
  customerId: z.string(),
  addressId: z.string().optional(),
  technicianId: z.string().optional(),
  title: z.string().min(1),
  jobType: z.string().min(1),
  leadSource: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: z.nativeEnum(JobStatus).optional(),
  priority: z.string().default("normal"),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
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

jobsRouter.get("/", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status as JobStatus : undefined;
  const locationId = activeLocationId(req);
  const jobs = await prisma.job.findMany({
    where: { locationId, ...(status ? { status } : {}) },
    include: {
      customer: { include: { addresses: true } },
      address: true,
      technician: true,
      notes: { orderBy: { createdAt: "desc" } },
      lineItems: true,
      invoices: { include: { payments: true } }
    },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
    take: 150
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
    include: {
      customer: { include: { addresses: true } },
      address: true,
      technician: true,
      lineItems: true,
      invoices: { include: { payments: true } }
    }
  });
  if (optionNames.length) {
    await Promise.all(optionNames.map((option) => prisma.crmOption.upsert({
      where: { locationId_kind_name: { locationId, kind: option.kind, name: option.name } },
      create: { locationId, kind: option.kind, name: option.name },
      update: {}
    })));
  }
  res.status(201).json({ job });
}));

jobsRouter.get("/:id", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const job = await prisma.job.findFirst({
    where: { id: jobId, locationId: activeLocationId(req) },
    include: {
      customer: { include: { addresses: true } },
      address: true,
      technician: true,
      notes: { orderBy: { createdAt: "desc" } },
      lineItems: true,
      invoices: { include: { payments: true } }
    }
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
}));

jobsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const jobId = String(req.params.id);
  const input = jobSchema.partial().parse(req.body);
  const { lineItems: _lineItems, ...jobInput } = input;
  const existing = await prisma.job.findFirst({ where: { id: jobId, locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Job not found" });
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      ...jobInput,
      scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
      scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined
    },
    include: {
      customer: { include: { addresses: true } },
      address: true,
      technician: true,
      notes: { orderBy: { createdAt: "desc" } },
      lineItems: true,
      invoices: { include: { payments: true } }
    }
  });
  res.json({ job });
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
  const input = z.object({
    category: z.enum(["service", "material"]).default("service"),
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().int().default(0),
    unitCost: z.number().int().default(0),
    taxable: z.boolean().default(true)
  }).parse(req.body);
  const job = await prisma.job.findFirst({ where: { id: jobId, locationId: activeLocationId(req) } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const lineItem = await prisma.jobLineItem.create({ data: { jobId, ...input } });
  res.status(201).json({ lineItem });
}));
