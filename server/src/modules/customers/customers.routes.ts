import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const customersRouter = Router();

const customerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(7),
  alternatePhone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  address: z.object({
    label: z.string().default("Service"),
    street1: z.string().min(1),
    street2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(2),
    postalCode: z.string().min(3)
  }).optional()
});

customersRouter.get("/", asyncHandler(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const locationId = activeLocationId(req);
  const customers = await prisma.customer.findMany({
    where: {
      locationId,
      ...(q ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } }
        ]
      } : {})
    },
    include: { addresses: true },
    orderBy: { updatedAt: "desc" },
    take: 100
  });
  res.json({ customers });
}));

customersRouter.post("/", asyncHandler(async (req, res) => {
  const input = customerSchema.parse(req.body);
  const locationId = activeLocationId(req);
  const customer = await prisma.customer.create({
    data: {
      locationId,
      firstName: input.firstName,
      lastName: input.lastName,
      companyName: input.companyName,
      email: input.email || undefined,
      phone: input.phone,
      alternatePhone: input.alternatePhone,
      source: input.source,
      notes: input.notes,
      addresses: input.address ? { create: input.address } : undefined
    },
    include: { addresses: true }
  });
  res.status(201).json({ customer });
}));

customersRouter.get("/:id", asyncHandler(async (req, res) => {
  const customerId = String(req.params.id);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, locationId: activeLocationId(req) },
    include: { addresses: true, jobs: true, invoices: true, messages: { orderBy: { createdAt: "desc" } } }
  });

  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ customer });
}));

customersRouter.delete("/:id", asyncHandler(async (req, res) => {
  const customerId = String(req.params.id);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, locationId: activeLocationId(req) },
    include: { jobs: true, invoices: true }
  });

  if (!customer) return res.status(404).json({ error: "Customer not found" });
  if (customer.jobs.length || customer.invoices.length) {
    return res.status(409).json({ error: "Customer has jobs or invoices and cannot be removed yet" });
  }

  await prisma.customer.delete({ where: { id: customer.id } });
  res.status(204).send();
}));
