import { InvoiceStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const invoicesRouter = Router();

const invoiceSchema = z.object({
  customerId: z.string(),
  jobId: z.string().optional(),
  status: z.nativeEnum(InvoiceStatus).default("DRAFT"),
  tax: z.number().int().default(0),
  dueAt: z.string().datetime().optional(),
  items: z.array(z.object({
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
    include: { customer: true, job: true, items: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 150
  });
  res.json({ invoices });
}));

invoicesRouter.post("/", asyncHandler(async (req, res) => {
  const input = invoiceSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const subtotal = input.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
  const invoice = await prisma.invoice.create({
    data: {
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
    include: { customer: true, items: true, payments: true }
  });
  res.status(201).json({ invoice });
}));

invoicesRouter.get("/:id", asyncHandler(async (req, res) => {
  const invoiceId = String(req.params.id);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, locationId: activeLocationId(req) },
    include: { customer: true, job: true, items: true, payments: true }
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json({ invoice });
}));
