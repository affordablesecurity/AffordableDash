import { EstimateStatus, JobStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendEmail } from "../messaging/email.service.js";
import { sendLocationSms } from "../messaging/messaging.service.js";

export const estimatesRouter = Router();

const lineItemSchema = z.object({
  optionId: z.string().optional(),
  optionKey: z.string().optional(),
  category: z.enum(["service", "material"]).default("service"),
  name: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().int().default(0),
  unitCost: z.number().int().default(0),
  taxable: z.boolean().default(true)
});

const estimateCreateOptionSchema = z.object({
  clientId: z.string().optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  imageName: z.string().trim().max(200).optional(),
  lineItems: z.array(lineItemSchema).default([])
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
  workflowStatus: z.enum(["DRAFT", "SCHEDULED", "EN_ROUTE", "FINISHED"]).optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  description: z.string().optional(),
  internalNotes: z.string().optional(),
  approvalSignature: z.string().optional(),
  approvalName: z.string().optional(),
  depositType: z.enum(["NONE", "PERCENT", "FIXED"]).optional(),
  depositPercent: z.number().int().min(1).max(100).optional(),
  depositAmount: z.number().int().min(1).optional(),
  attachments: z.array(z.string()).default([]),
  options: z.array(estimateCreateOptionSchema).optional(),
  lineItems: z.array(lineItemSchema).default([])
});

const sendEstimateSchema = z.object({
  method: z.enum(["email", "text", "both"]),
  to: z.string().trim().optional(),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional()
});

const appointmentSchema = z.object({
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().optional(),
  technicianId: z.string().nullable().optional(),
  notify: z.boolean().optional()
});

const optionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  imageName: z.string().trim().max(200).optional()
});

const estimateInclude = {
  customer: { include: { addresses: true } },
  address: true,
  technician: true,
  appointments: { include: { technician: true }, orderBy: { scheduledStart: "asc" as const } },
  lineItems: true,
  options: { include: { lineItems: true }, orderBy: { sortOrder: "asc" as const } },
  approvedOption: true,
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

function cents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

function estimateSubtotal(input: { lineItems: Array<{ quantity: unknown; unitPrice: number }> }) {
  return input.lineItems.reduce((sum, item) => sum + Math.round(Number(item.quantity || 0) * item.unitPrice), 0);
}

function estimateTax(input: { lineItems: Array<{ category: string; taxable: boolean; quantity: unknown; unitPrice: number }> }) {
  const taxable = input.lineItems.reduce((sum, item) => item.category === "material" && item.taxable !== false
    ? sum + Math.round(Number(item.quantity || 0) * item.unitPrice)
    : sum, 0);
  return Math.round(taxable * 0.094);
}

function estimateTotal(input: { lineItems: Array<{ category: string; taxable: boolean; quantity: unknown; unitPrice: number }> }) {
  return estimateSubtotal(input) + estimateTax(input);
}

function appointmentWindow(start: Date, end: Date) {
  const date = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${startTime}-${endTime}`;
}

function validateAppointmentWindow(input: z.infer<typeof appointmentSchema>) {
  const scheduledStart = new Date(input.scheduledStart);
  const scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : new Date(scheduledStart.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime()) || scheduledEnd <= scheduledStart) {
    throw new Error("Appointment end time must be after the start time.");
  }
  return { scheduledStart, scheduledEnd };
}

async function syncEstimateSchedule(tx: Prisma.TransactionClient, estimateId: string) {
  const nextAppointment = await tx.estimateAppointment.findFirst({
    where: { estimateId, status: { not: "CANCELED" } },
    orderBy: { scheduledStart: "asc" }
  });
  await tx.estimate.update({
    where: { id: estimateId },
    data: {
      scheduledStart: nextAppointment?.scheduledStart ?? null,
      scheduledEnd: nextAppointment?.scheduledEnd ?? null,
      technicianId: nextAppointment?.technicianId ?? null,
      workflowStatus: nextAppointment ? "SCHEDULED" : "DRAFT"
    }
  });
}

async function notifyEstimateAppointment(estimate: {
  locationId: string;
  customerId: string;
  customer: { firstName: string; phone: string; communicationPrefs: Prisma.JsonValue };
}, appointment: { scheduledStart: Date; scheduledEnd: Date; technician?: { name: string } | null }, kind: "scheduled" | "changed" | "omw" | "canceled") {
  const firstName = estimate.customer.firstName || "there";
  const techName = appointment.technician?.name || "Affordable Security";
  const window = appointmentWindow(appointment.scheduledStart, appointment.scheduledEnd);
  const body = kind === "omw"
    ? `${techName} with Affordable Security is on the way for your estimate.`
    : kind === "canceled"
      ? `Your Affordable Security estimate appointment for ${window} was canceled.`
      : `Hi ${firstName}, ${techName} with Affordable Security is ${kind === "changed" ? "now " : ""}scheduled for ${window}.`;
  return sendLocationSms({
    locationId: estimate.locationId,
    customerId: estimate.customerId,
    to: estimate.customer.phone,
    body,
    templateKey: kind === "omw" ? "estimateOnMyWay" : kind === "canceled" ? "estimateAppointmentCanceled" : "estimateAppointmentScheduled",
    customer: estimate.customer
  });
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
  const depositType = input.depositType ?? "NONE";
  const workflowStatus = input.workflowStatus ?? (input.scheduledStart ? "SCHEDULED" : "DRAFT");
  const estimate = await prisma.$transaction(async (tx) => {
    const created = await tx.estimate.create({
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
        workflowStatus,
        scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
        scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined,
        description: input.description,
        internalNotes: input.internalNotes,
        approvalSignature: input.approvalSignature,
        approvalName: input.approvalName,
        approvedAt: status === EstimateStatus.APPROVED ? new Date() : undefined,
        declinedAt: status === EstimateStatus.DECLINED ? new Date() : undefined,
        depositType,
        depositPercent: depositType === "PERCENT" ? input.depositPercent ?? 50 : undefined,
        depositAmount: depositType === "FIXED" ? input.depositAmount : undefined,
        attachments: input.attachments
      },
      include: estimateInclude
    });
    if (input.scheduledStart) {
      const scheduledStart = new Date(input.scheduledStart);
      const scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : new Date(scheduledStart.getTime() + 60 * 60 * 1000);
      await tx.estimateAppointment.create({
        data: {
          locationId,
          estimateId: created.id,
          technicianId: input.technicianId,
          scheduledStart,
          scheduledEnd
        }
      });
    }
    const submittedOptions = input.options?.length ? input.options : [{
      clientId: "option-1",
      title: "Option #1",
      description: input.description,
      lineItems: input.lineItems
    }];
    for (const [index, optionInput] of submittedOptions.entries()) {
      const option = await tx.estimateOption.create({
        data: {
          estimateId: created.id,
          title: optionInput.title,
          description: optionInput.description,
          imageName: optionInput.imageName,
          sortOrder: index
        }
      });
      const optionLineItems = optionInput.lineItems.length
        ? optionInput.lineItems
        : input.lineItems.filter((item) => item.optionKey && item.optionKey === optionInput.clientId);
      if (optionLineItems.length) {
        await tx.estimateLineItem.createMany({
          data: optionLineItems.map(({ optionKey: _optionKey, ...item }) => ({
            ...item,
            estimateId: created.id,
            optionId: option.id
          }))
        });
      }
    }
    return tx.estimate.findUniqueOrThrow({ where: { id: created.id }, include: estimateInclude });
  });
  await saveOptions(locationId, input);
  res.status(201).json({ estimate });
}));

estimatesRouter.post("/:id/options", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = optionSchema.parse(req.body);
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { options: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  const option = await prisma.estimateOption.create({
    data: {
      estimateId: estimate.id,
      title: input.title,
      description: input.description,
      imageName: input.imageName,
      sortOrder: estimate.options.length
    }
  });
  const updated = await prisma.estimate.findFirstOrThrow({ where: { id: estimate.id, locationId }, include: estimateInclude });
  res.status(201).json({ estimate: updated, option });
}));

estimatesRouter.patch("/:id/options/:optionId", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = optionSchema.partial().parse(req.body);
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { options: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  const option = estimate.options.find((item) => item.id === String(req.params.optionId));
  if (!option) return res.status(404).json({ error: "Estimate option not found" });
  await prisma.estimateOption.update({
    where: { id: option.id },
    data: {
      title: input.title,
      description: input.description,
      imageName: input.imageName
    }
  });
  const updated = await prisma.estimate.findFirstOrThrow({ where: { id: estimate.id, locationId }, include: estimateInclude });
  res.json({ estimate: updated });
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
  const { lineItems, options: _options, ...estimateInput } = input;
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
        lineItems: lineItems ? { create: lineItems.map(({ optionKey: _optionKey, ...item }) => item) } : undefined
      },
      include: estimateInclude
    });
  });

  if (input.jobType) await saveOptions(locationId, { jobType: input.jobType, leadSource: input.leadSource, tags: input.tags ?? [] });
  res.json({ estimate });
}));

estimatesRouter.post("/:id/appointments", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = appointmentSchema.parse(req.body);
  let dates: ReturnType<typeof validateAppointmentWindow>;
  try {
    dates = validateAppointmentWindow(input);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Invalid appointment window." });
  }
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { customer: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  const result = await prisma.$transaction(async (tx) => {
    const appointment = await tx.estimateAppointment.create({
      data: {
        locationId,
        estimateId: estimate.id,
        technicianId: input.technicianId || null,
        scheduledStart: dates.scheduledStart,
        scheduledEnd: dates.scheduledEnd
      },
      include: { technician: true }
    });
    await syncEstimateSchedule(tx, estimate.id);
    const updated = await tx.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: estimateInclude });
    return { appointment, estimate: updated };
  });

  const delivery = input.notify === false ? null : await notifyEstimateAppointment(estimate, result.appointment, "scheduled");
  res.status(201).json({ ...result, delivery });
}));

estimatesRouter.patch("/:id/appointments/:appointmentId", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = appointmentSchema.parse(req.body);
  let dates: ReturnType<typeof validateAppointmentWindow>;
  try {
    dates = validateAppointmentWindow(input);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Invalid appointment window." });
  }
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { customer: true, appointments: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (!estimate.appointments.some((appointment) => appointment.id === String(req.params.appointmentId))) {
    return res.status(404).json({ error: "Appointment not found" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const appointment = await tx.estimateAppointment.update({
      where: { id: String(req.params.appointmentId) },
      data: {
        technicianId: input.technicianId || null,
        scheduledStart: dates.scheduledStart,
        scheduledEnd: dates.scheduledEnd,
        status: "SCHEDULED",
        canceledAt: null
      },
      include: { technician: true }
    });
    await syncEstimateSchedule(tx, estimate.id);
    const updated = await tx.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: estimateInclude });
    return { appointment, estimate: updated };
  });

  const delivery = input.notify === false ? null : await notifyEstimateAppointment(estimate, result.appointment, "changed");
  res.json({ ...result, delivery });
}));

estimatesRouter.post("/:id/appointments/:appointmentId/omw", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { customer: true, appointments: { include: { technician: true } } }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  const appointment = estimate.appointments.find((item) => item.id === String(req.params.appointmentId));
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });
  if (appointment.status === "CANCELED") return res.status(422).json({ error: "Canceled appointments cannot send on-my-way texts." });
  const updatedEstimate = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { workflowStatus: "EN_ROUTE" },
    include: estimateInclude
  });
  const delivery = await notifyEstimateAppointment(estimate, appointment, "omw");
  res.json({ estimate: updatedEstimate, appointment, delivery });
}));

estimatesRouter.post("/:id/appointments/:appointmentId/cancel", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { customer: true, appointments: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (!estimate.appointments.some((appointment) => appointment.id === String(req.params.appointmentId))) {
    return res.status(404).json({ error: "Appointment not found" });
  }
  const result = await prisma.$transaction(async (tx) => {
    const appointment = await tx.estimateAppointment.update({
      where: { id: String(req.params.appointmentId) },
      data: { status: "CANCELED", canceledAt: new Date() },
      include: { technician: true }
    });
    await syncEstimateSchedule(tx, estimate.id);
    const updated = await tx.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: estimateInclude });
    return { appointment, estimate: updated };
  });
  const delivery = await notifyEstimateAppointment(estimate, result.appointment, "canceled");
  res.json({ ...result, delivery });
}));

estimatesRouter.delete("/:id/appointments/:appointmentId", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const estimate = await prisma.estimate.findFirst({
    where: { id: String(req.params.id), locationId },
    include: { appointments: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (!estimate.appointments.some((appointment) => appointment.id === String(req.params.appointmentId))) {
    return res.status(404).json({ error: "Appointment not found" });
  }
  const updatedEstimate = await prisma.$transaction(async (tx) => {
    await tx.estimateAppointment.delete({ where: { id: String(req.params.appointmentId) } });
    await syncEstimateSchedule(tx, estimate.id);
    return tx.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: estimateInclude });
  });
  res.json({ estimate: updatedEstimate });
}));

estimatesRouter.post("/:id/send", asyncHandler(async (req, res) => {
  const estimateId = String(req.params.id);
  const locationId = activeLocationId(req);
  const input = sendEstimateSchema.parse(req.body);
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, locationId },
    include: { ...estimateInclude, location: true }
  });
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });

  const publicBaseUrl = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const estimateUrl = `${publicBaseUrl}/estimate/${estimate.estimateNumber}`;
  const shortEstimateUrl = `${publicBaseUrl}/e/${estimate.estimateNumber}`;
  const total = estimateTotal(estimate);
  const defaultTextBody = `Estimate #${estimate.estimateNumber} ${cents(total)}: ${shortEstimateUrl}`;
  const defaultBody = `Estimate #${estimate.estimateNumber} ${cents(total)}: ${estimateUrl}`;
  const body = input.message?.includes(estimateUrl)
    ? input.message
    : `${(input.message || defaultBody).trim()}${input.message ? `\n\nView estimate: ${estimateUrl}` : ""}`.trim();
  const deliveries: unknown[] = [];
  const wantsEmail = input.method === "email" || input.method === "both";
  const wantsText = input.method === "text" || input.method === "both";

  if (wantsText) {
    const to = input.method === "text" ? input.to : input.to?.split(",").map((part) => part.trim()).find((part) => /\d/.test(part));
    deliveries.push(await sendLocationSms({
      locationId,
      customerId: estimate.customerId,
      to: to || estimate.customer.phone,
      body: body.length > 155 ? defaultTextBody : body.replace(estimateUrl, shortEstimateUrl),
      templateKey: "estimateSent",
      customer: estimate.customer
    }));
  }

  if (wantsEmail) {
    const to = input.method === "email" ? input.to : input.to?.split(",").map((part) => part.trim()).find((part) => part.includes("@"));
    const recipient = to || estimate.customer.email;
    if (!recipient) return res.status(422).json({ error: "This customer does not have an email address for estimate email." });
    deliveries.push(await sendEmail({
      locationId,
      customerId: estimate.customerId,
      to: recipient,
      subject: input.subject || `Estimate #${estimate.estimateNumber} from ${estimate.location.displayName || estimate.location.name}`,
      body,
      templateKey: "estimateSentEmail"
    }));
  }

  const updatedEstimate = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: estimate.status === EstimateStatus.DRAFT ? EstimateStatus.SENT : estimate.status },
    include: estimateInclude
  });

  res.json({ estimate: updatedEstimate, deliveries, estimateUrl });
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
  if (estimate.status === EstimateStatus.DECLINED) {
    return res.status(422).json({ error: "Declined estimates cannot be copied into jobs." });
  }
  if (estimate.workflowStatus !== "FINISHED" && estimate.status !== EstimateStatus.APPROVED) {
    return res.status(422).json({ error: "Finish the estimate workflow before copying it into a job." });
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
      data: { status: EstimateStatus.CONVERTED, workflowStatus: "FINISHED", convertedJobId: job.id },
      include: estimateInclude
    });
    return { estimate: updatedEstimate, job };
  });

  res.status(201).json(result);
}));
