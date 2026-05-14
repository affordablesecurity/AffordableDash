import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const customersRouter = Router();

const phoneEntrySchema = z.object({
  label: z.enum(["mobile", "work", "home", "other"]).default("mobile"),
  number: z.string().min(7)
});

const communicationPrefsSchema = z.object({
  sms: z.boolean().default(true),
  email: z.boolean().default(true),
  phone: z.boolean().default(true)
});

const addressSchema = z.object({
  label: z.string().default("Service"),
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2),
  postalCode: z.string().min(3)
});

const customerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(7),
  alternatePhone: z.string().optional(),
  additionalEmails: z.array(z.string().email()).default([]),
  additionalPhones: z.array(phoneEntrySchema).default([]),
  source: z.string().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  communicationPrefs: communicationPrefsSchema.default({ sms: true, email: true, phone: true }),
  attachments: z.array(z.string()).default([]),
  paymentMethodNote: z.string().optional(),
  address: addressSchema.optional()
});

const customerUpdateSchema = customerSchema.partial();
const customerNoteSchema = z.object({ content: z.string().min(1), author: z.string().optional() });
const attachmentSchema = z.object({ name: z.string().min(1) });

const customerInclude = {
  addresses: true,
  privateNotes: { orderBy: { createdAt: "desc" as const } },
  jobs: {
    orderBy: { createdAt: "desc" as const },
    include: { address: true, technician: true, invoices: true }
  },
  invoices: {
    orderBy: { createdAt: "desc" as const },
    include: { job: true, payments: true, items: true }
  },
  messages: { orderBy: { createdAt: "desc" as const } }
};

async function saveCustomerOptions(locationId: string, input: { source?: string; tags?: string[] }) {
  const optionCreates = [
    ...(input.source ? [{ kind: "leadSource", name: input.source }] : []),
    ...(input.tags ?? []).map((name) => ({ kind: "tag", name }))
  ];
  await Promise.all(optionCreates.map((option) => prisma.crmOption.upsert({
    where: { locationId_kind_name: { locationId, kind: option.kind, name: option.name } },
    create: { locationId, ...option },
    update: {}
  })));
}

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
    include: customerInclude,
    orderBy: { updatedAt: "desc" },
    take: 100
  });
  res.json({ customers });
}));

customersRouter.post("/", asyncHandler(async (req, res) => {
  const input = customerSchema.parse(req.body);
  const locationId = activeLocationId(req);
  await saveCustomerOptions(locationId, { source: input.source, tags: input.tags });
  const customer = await prisma.customer.create({
    data: {
      locationId,
      firstName: input.firstName,
      lastName: input.lastName,
      companyName: input.companyName,
      email: input.email || undefined,
      phone: input.phone,
      alternatePhone: input.alternatePhone,
      additionalEmails: input.additionalEmails,
      additionalPhones: input.additionalPhones,
      source: input.source,
      tags: input.tags,
      notes: input.notes,
      communicationPrefs: input.communicationPrefs,
      attachments: input.attachments,
      paymentMethodNote: input.paymentMethodNote,
      addresses: input.address ? { create: input.address } : undefined
    },
    include: customerInclude
  });
  res.status(201).json({ customer });
}));

customersRouter.get("/:id", asyncHandler(async (req, res) => {
  const customerId = String(req.params.id);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, locationId: activeLocationId(req) },
    include: customerInclude
  });

  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({ customer });
}));

customersRouter.patch("/:id", asyncHandler(async (req, res) => {
  const customerId = String(req.params.id);
  const locationId = activeLocationId(req);
  const input = customerUpdateSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { id: customerId, locationId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });

  await saveCustomerOptions(locationId, { source: input.source, tags: input.tags });
  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      companyName: input.companyName,
      email: input.email || undefined,
      phone: input.phone,
      alternatePhone: input.alternatePhone,
      additionalEmails: input.additionalEmails,
      additionalPhones: input.additionalPhones,
      source: input.source,
      tags: input.tags,
      notes: input.notes,
      communicationPrefs: input.communicationPrefs,
      attachments: input.attachments,
      paymentMethodNote: input.paymentMethodNote
    },
    include: customerInclude
  });
  res.json({ customer });
}));

customersRouter.post("/:id/addresses", asyncHandler(async (req, res) => {
  const customerId = String(req.params.id);
  const locationId = activeLocationId(req);
  const input = addressSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { id: customerId, locationId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });

  await prisma.address.create({ data: { customerId: existing.id, ...input } });
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: existing.id }, include: customerInclude });
  res.status(201).json({ customer });
}));

customersRouter.post("/:id/notes", asyncHandler(async (req, res) => {
  const customerId = String(req.params.id);
  const locationId = activeLocationId(req);
  const input = customerNoteSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { id: customerId, locationId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });

  await prisma.customerNote.create({ data: { customerId: existing.id, content: input.content, author: input.author || "Office" } });
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: existing.id }, include: customerInclude });
  res.status(201).json({ customer });
}));

customersRouter.post("/:id/attachments", asyncHandler(async (req, res) => {
  const customerId = String(req.params.id);
  const locationId = activeLocationId(req);
  const input = attachmentSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { id: customerId, locationId } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });

  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: { attachments: [...existing.attachments, input.name] },
    include: customerInclude
  });
  res.status(201).json({ customer });
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
