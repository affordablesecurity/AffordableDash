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
  status: z.nativeEnum(JobStatus).optional(),
  priority: z.string().default("normal"),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  description: z.string().optional(),
  internalNotes: z.string().optional()
});

jobsRouter.get("/", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status as JobStatus : undefined;
  const locationId = activeLocationId(req);
  const jobs = await prisma.job.findMany({
    where: { locationId, ...(status ? { status } : {}) },
    include: { customer: true, address: true, technician: true, lineItems: true },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
    take: 150
  });
  res.json({ jobs });
}));

jobsRouter.post("/", asyncHandler(async (req, res) => {
  const input = jobSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const job = await prisma.job.create({
    data: {
      ...input,
      locationId,
      scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
      scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined
    },
    include: { customer: true, address: true, technician: true }
  });
  res.status(201).json({ job });
}));

jobsRouter.get("/:id", asyncHandler(async (req, res) => {
  const job = await prisma.job.findFirst({
    where: { id: req.params.id, locationId: activeLocationId(req) },
    include: { customer: true, address: true, technician: true, notes: true, lineItems: true, invoices: true }
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
}));

jobsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const input = jobSchema.partial().parse(req.body);
  const existing = await prisma.job.findFirst({ where: { id: req.params.id, locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Job not found" });
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: {
      ...input,
      scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
      scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined
    },
    include: { customer: true, address: true, technician: true }
  });
  res.json({ job });
}));

jobsRouter.post("/:id/notes", asyncHandler(async (req, res) => {
  const input = z.object({ author: z.string().default("Office"), content: z.string().min(1) }).parse(req.body);
  const job = await prisma.job.findFirst({ where: { id: req.params.id, locationId: activeLocationId(req) } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const note = await prisma.jobNote.create({ data: { jobId: req.params.id, ...input } });
  res.status(201).json({ note });
}));

jobsRouter.post("/:id/line-items", asyncHandler(async (req, res) => {
  const input = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().int().default(0),
    unitCost: z.number().int().default(0),
    taxable: z.boolean().default(true)
  }).parse(req.body);
  const job = await prisma.job.findFirst({ where: { id: req.params.id, locationId: activeLocationId(req) } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const lineItem = await prisma.jobLineItem.create({ data: { jobId: req.params.id, ...input } });
  res.status(201).json({ lineItem });
}));
