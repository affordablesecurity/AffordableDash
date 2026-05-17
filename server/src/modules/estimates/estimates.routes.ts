import { EstimateStatus, JobStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const estimatesRouter = Router();

const lineItemSchema = z.object({
  category: z.enum(["service", "material"]).default("service"),
  name: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().int().default(0),
  unitCost: z.number().int().default(0),
  taxable: z.boolean().default(true)
});

const estimateSchema = z.object({
  customerId: z.string(),
  addressId: z.string().optional(),
  technicianId: z.string().optional(),
  title: z.string().min(1),
  jobType: z.string().min(1),
  leadSource: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: z.nativeEnum(EstimateStatus).optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  description: z.string().optional(),
  internalNotes: z.string().optional(),
  approvalSignature: z.string().optional(),
  approvalName: z.string().optional(),
  depositType: z.enum(["NONE", "PERCENT", "FIXED"]).default("NONE"),
  depositPercent: z.number().int().min(1).max(100).optional(),
  depositAmount: z.number().int().min(1).optional(),
  attachments: z.array(z.string()).default([]),
  lineItems: z.array(lineItemSchema).default([])
});

const estimateInclude = {
  customer: { include: { addresses: true } },
  address: true,
  technician: true,
  lineItems: true,
  convertedJob: { include: { invoices: { include: { payments: true } } } }
} as const;

async function saveOptions(locationId: string, input: { jobType: string; leadSource?: string; tags: string[] }) {
  const optionNames = [
    { kind: "jobType", name: input.jobType },
    ...(input.leadSource ? [{ kind: "leadSource", name: input.leadSource }] : []),
    ...input.tags.map((name) => ({ kind: "tag", name }))
  ].filter((option) => option.name.trim());

  if (!optionNames.length) return;
  await Promise.all(optionNames.map((option) => prisma.crmOption.upsert({
    where: { locationId_kind_name: { locationId, kind: option.kind, name: option.name } },
    create: { locationId, kind: option.kind, name: option.name },
    update: {}
  })));
}

estimatesRouter.get("/", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status as EstimateStatus : undefined;
  const locationId = activeLocationId(req);
  const estimates = await prisma.estimate.findMany({
    where: { locationId, ...(status ? { status } : {}) },
    include: estimateInclude,
    orderBy: { createdAt: "desc" },
    take: 150
  });
  res.json({ estimates });
}));

estimatesRouter.post("/", asyncHandler(async (req, res) => {
  const input = estimateSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const status = input.status ?? EstimateStatus.DRAFT;
  const estimate = await prisma.estimate.create({
    data: {
      locationId,
      customerId: input.customerId,
      addressId: input.addressId,
      technicianId: input.technicianId,
      title: input.title,
      jobType: input.jobType,
      leadSource: input.leadSource,
      tags: input.tags,
      status,
      scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
      scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined,
      description: input.description,
      internalNotes: input.internalNotes,
      approvalSignature: input.approvalSignature,
      approvalName: input.approvalName,
      approvedAt: status === EstimateStatus.APPROVED ? new Date() : undefined,
      declinedAt: status === EstimateStatus.DECLINED ? new Date() : undefined,
      depositType: input.depositType,
      depositPercent: input.depositType === "PERCENT" ? input.depositPercent ?? 50 : undefined,
      depositAmount: input.depositType === "FIXED" ? input.depositAmount : undefined,
      attachments: input.attachments,
      lineItems: input.lineItems.length ? { create: input.lineItems } : undefined
    },
    include: estimateInclude
  });
  await saveOptions(locationId, input);
  res.status(201).json({ estimate });
}));

estimatesRouter.get("/:id", asyncHandler(async (req, res) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId: activeLocationId(req) },
    include: estimateInclude
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  res.json({ estimate });
}));

estimatesRouter.patch("/:id", asyncHandler(async (req, res) => {
  const input = estimateSchema.partial().parse(req.body);
  const locationId = activeLocationId(req);
  const existing = await prisma.estimate.findFirst({ where: { id: String(req.params.id), locationId } });
  if (!existing) return res.status(404).json({ error: "Estimate not found" });

  const status = input.status;
  const { lineItems, ...estimateInput } = input;
  const estimate = await prisma.$transaction(async (tx) => {
    if (lineItems) {
      await tx.estimateLineItem.deleteMany({ where: { estimateId: existing.id } });
    }
    return tx.estimate.update({
      where: { id: existing.id },
      data: {
        ...estimateInput,
        depositPercent: input.depositType === "PERCENT" ? input.depositPercent ?? existing.depositPercent ?? 50 : input.depositType === "NONE" ? null : undefined,
        depositAmount: input.depositType === "FIXED" ? input.depositAmount ?? existing.depositAmount : input.depositType === "NONE" ? null : undefined,
        scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
        scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined,
        approvedAt: status === EstimateStatus.APPROVED ? new Date() : undefined,
        declinedAt: status === EstimateStatus.DECLINED ? new Date() : undefined,
        lineItems: lineItems ? { create: lineItems } : undefined
      },
      include: estimateInclude
    });
  });

  if (input.jobType) await saveOptions(locationId, { jobType: input.jobType, leadSource: input.leadSource, tags: input.tags ?? [] });
  res.json({ estimate });
}));

estimatesRouter.post("/:id/convert-to-job", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { ...estimateInclude, lineItems: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.convertedJobId) {
    const job = await prisma.job.findFirst({
      where: { id: estimate.convertedJobId, locationId },
      include: {
        customer: { include: { addresses: true } },
        address: true,
        technician: true,
        notes: { orderBy: { createdAt: "desc" } },
        lineItems: true,
        invoices: { include: { payments: true } }
      }
    });
    return res.json({ estimate, job });
  }
  if (estimate.status !== EstimateStatus.APPROVED) {
    return res.status(422).json({ error: "Approve the estimate before converting it to a job." });
  }

  const result = await prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        locationId,
        customerId: estimate.customerId,
        addressId: estimate.addressId,
        technicianId: estimate.technicianId,
        title: estimate.title,
        jobType: estimate.jobType,
        leadSource: estimate.leadSource,
        tags: estimate.tags,
        status: estimate.scheduledStart ? JobStatus.SCHEDULED : JobStatus.LEAD,
        scheduledStart: estimate.scheduledStart,
        scheduledEnd: estimate.scheduledEnd,
        description: estimate.description,
        internalNotes: estimate.internalNotes,
        attachments: estimate.attachments,
        lineItems: estimate.lineItems.length ? {
          create: estimate.lineItems.map((item) => ({
            category: item.category,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            taxable: item.taxable
          }))
        } : undefined,
        notes: { create: { author: "System", content: `Converted from estimate #${estimate.estimateNumber}.` } }
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
    const updatedEstimate = await tx.estimate.update({
      where: { id: estimate.id },
      data: { status: EstimateStatus.CONVERTED, convertedJobId: job.id },
      include: estimateInclude
    });
    return { estimate: updatedEstimate, job };
  });

  res.status(201).json(result);
}));
