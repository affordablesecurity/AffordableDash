import { JobStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendJobTemplateSms } from "../messaging/messaging.service.js";

export const publicBookingRouter = Router();

const bookingRequestSchema = z.object({
  serviceId: z.string().optional(),
  serviceName: z.string().min(1),
  zipCode: z.string().min(3),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional().or(z.literal("")),
  smsConsent: z.boolean().default(true),
  address: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
  trackingAttribute: z.string().optional(),
  sourceLabel: z.string().optional()
});

async function findBookingLocation(key: string) {
  return prisma.location.findFirst({
    where: { active: true, OR: [{ id: key }, { slug: key }] },
    include: { organization: true }
  });
}

function defaultSlots() {
  const slots = [];
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(8, 0, 0, 0);
  for (let day = 0; day < 7; day += 1) {
    for (const hour of [8, 10, 12, 14, 16]) {
      const slotStart = new Date(start);
      slotStart.setDate(start.getDate() + day);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(slotStart.getHours() + 2);
      slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }
  }
  return slots;
}

publicBookingRouter.get("/:locationKey", asyncHandler(async (req, res) => {
  const location = await findBookingLocation(String(req.params.locationKey));
  if (!location) return res.status(404).json({ error: "Booking page not found" });

  const services = await prisma.priceBookItem.findMany({
    where: { locationId: location.id, active: true, onlineBooking: true },
    include: { category: true },
    orderBy: [{ itemType: "asc" }, { name: "asc" }],
    take: 40
  });

  res.json({
    location: {
      id: location.id,
      slug: location.slug,
      name: location.displayName || location.organization.name || location.name,
      phone: location.phone,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      timezone: location.timezone,
      companyColor: location.companyColor,
      logoName: location.logoName
    },
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      category: service.category?.name || service.itemType,
      taxable: service.taxable,
      itemType: service.itemType
    })),
    slots: defaultSlots()
  });
}));

publicBookingRouter.post("/:locationKey", asyncHandler(async (req, res) => {
  const location = await findBookingLocation(String(req.params.locationKey));
  if (!location) return res.status(404).json({ error: "Booking page not found" });
  const input = bookingRequestSchema.parse(req.body);
  const service = input.serviceId
    ? await prisma.priceBookItem.findFirst({ where: { id: input.serviceId, locationId: location.id, active: true }, include: { category: true } })
    : null;
  const source = input.sourceLabel || input.trackingAttribute || "Online Booking";
  const existingCustomer = await prisma.customer.findFirst({
    where: {
      locationId: location.id,
      deletedAt: null,
      OR: [
        { phone: input.phone },
        ...(input.email ? [{ email: input.email }] : [])
      ]
    },
    include: { addresses: true }
  });
  const customer = existingCustomer ?? await prisma.customer.create({
    data: {
      locationId: location.id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email || undefined,
      source,
      tags: ["Online Booking", ...(input.trackingAttribute ? [`attr:${input.trackingAttribute}`] : [])],
      notes: input.notes,
      communicationPrefs: { sms: input.smsConsent, email: true, phone: true },
      addresses: input.address ? {
        create: {
          label: "Service",
          street1: input.address,
          city: input.city || location.city || "Yuma",
          state: location.state || "AZ",
          postalCode: input.zipCode
        }
      } : undefined
    },
    include: { addresses: true }
  });
  const addressId = customer.addresses[0]?.id;
  const job = await prisma.job.create({
    data: {
      locationId: location.id,
      customerId: customer.id,
      addressId,
      title: input.serviceName,
      jobType: service?.category?.name || input.serviceName,
      leadSource: source,
      tags: ["Online Booking", ...(input.trackingAttribute ? [`attr:${input.trackingAttribute}`] : [])],
      status: JobStatus.SCHEDULED,
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: new Date(input.scheduledEnd),
      description: input.notes,
      internalNotes: `Booked online${input.trackingAttribute ? ` via ${input.trackingAttribute}` : ""}. Zip: ${input.zipCode}.`,
      lineItems: {
        create: [{
          category: service?.itemType === "material" ? "material" : "service",
          name: service?.name || input.serviceName,
          description: service?.description,
          quantity: 1,
          unitPrice: service?.price ?? 0,
          unitCost: service?.cost ?? 0,
          taxable: service?.itemType === "material" && service.taxable !== false
        }]
      }
    },
    include: { customer: true }
  });
  await prisma.crmOption.upsert({
    where: { locationId_kind_name: { locationId: location.id, kind: "leadSource", name: source } },
    create: { locationId: location.id, kind: "leadSource", name: source },
    update: {}
  });
  await sendJobTemplateSms(location.id, job.id, "appointmentScheduled").catch(() => undefined);
  res.status(201).json({ jobNumber: job.jobNumber, customerId: customer.id });
}));
