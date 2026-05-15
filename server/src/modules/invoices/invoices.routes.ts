import { InvoiceStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const invoicesRouter = Router();

const invoiceInclude = {
  customer: { include: { addresses: true } },
  job: { include: { address: true, technician: true, lineItems: true } },
  items: true,
  payments: true
} as const;

const invoiceSchema = z.object({
  customerId: z.string(),
  jobId: z.string().optional(),
  status: z.nativeEnum(InvoiceStatus).default("DRAFT"),
  tax: z.number().int().default(0),
  dueAt: z.string().datetime().optional(),
  items: z.array(z.object({
    category: z.enum(["service", "material"]).default("service"),
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().int().default(0),
    taxable: z.boolean().default(true)
  })).default([])
});

invoicesRouter.get("/", asyncHandler(async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { locationId: activeLocationId(req) },
    include: invoiceInclude,
    orderBy: { createdAt: "desc" },
    take: 150
  });
  res.json({ invoices });
}));

invoicesRouter.post("/", asyncHandler(async (req, res) => {
  const input = invoiceSchema.parse(req.body);
  const locationId = activeLocationId(req);
  if (input.jobId) {
    const existingJobInvoice = await prisma.invoice.findFirst({
      where: { jobId: input.jobId, locationId },
      include: invoiceInclude,
      orderBy: { createdAt: "asc" }
    });
    if (existingJobInvoice) {
      return res.json({ invoice: existingJobInvoice, reused: true });
    }
  }
  const subtotal = input.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { invoiceSettings: true }
  });
  const invoiceSettings = (location?.invoiceSettings ?? {}) as { matchInvoiceAndJobNumber?: boolean };
  const matchedJob = invoiceSettings.matchInvoiceAndJobNumber && input.jobId
    ? await prisma.job.findFirst({
      where: { id: input.jobId, locationId },
      select: { jobNumber: true }
    })
    : null;
  const canUseJobNumber = matchedJob
    ? !(await prisma.invoice.findUnique({ where: { invoiceNumber: matchedJob.jobNumber }, select: { id: true } }))
    : false;
  const invoice = await prisma.invoice.create({
    data: {
      ...(canUseJobNumber && matchedJob ? { invoiceNumber: matchedJob.jobNumber } : {}),
      locationId,
      customerId: input.customerId,
      jobId: input.jobId,
      status: input.status,
      subtotal,
      tax: input.tax,
      total: subtotal + input.tax,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      items: { create: input.items }
    },
    include: invoiceInclude
  });
  if (canUseJobNumber) {
    await prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('"Invoice"', 'invoiceNumber'),
        GREATEST((SELECT MAX("invoiceNumber") FROM "Invoice"), 1)
      )
    `;
  }
  res.status(201).json({ invoice, reused: false });
}));

invoicesRouter.get("/:id", asyncHandler(async (req, res) => {
  const invoiceId = String(req.params.id);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, locationId: activeLocationId(req) },
    include: invoiceInclude
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json({ invoice });
}));
