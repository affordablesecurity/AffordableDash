import { JobStatus, type Location, type OnlineBookingSettings } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendEmail } from "../messaging/email.service.js";
import { sendJobTemplateSms } from "../messaging/messaging.service.js";

export const bookingRouter = Router();
export const publicBookingRouter = Router();

const defaultOnlineBookingSettings = {
  serviceAreaZipCodes: [] as string[],
  helpHeading: "What do you need help with?",
  servicePrompt: "Please select your service",
  slotStartHour: 8,
  slotEndHour: 18,
  slotWindowMinutes: 120,
  slotIntervalMinutes: 120
};

const settingsSchema = z.object({
  serviceAreaZipCodes: z.array(z.string()).default([]),
  helpHeading: z.string().trim().min(1).max(120).default(defaultOnlineBookingSettings.helpHeading),
  servicePrompt: z.string().trim().min(1).max(120).default(defaultOnlineBookingSettings.servicePrompt),
  slotStartHour: z.number().int().min(0).max(23).default(8),
  slotEndHour: z.number().int().min(1).max(24).default(18),
  slotWindowMinutes: z.number().int().min(30).max(480).default(120),
  slotIntervalMinutes: z.number().int().min(30).max(480).default(120),
  serviceNames: z.array(z.string()).default([])
});

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

function normalizeZip(value?: string | null) {
  return (value ?? "").replace(/\D/g, "").slice(0, 5);
}

function cleanZipList(values: string[]) {
  return [...new Set(values.flatMap((value) => value.split(/[\s,]+/)).map(normalizeZip).filter((value) => value.length === 5))];
}

function cleanServiceNames(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 24);
}

async function findBookingLocation(key: string) {
  return prisma.location.findFirst({
    where: { active: true, OR: [{ id: key }, { slug: key }] },
    include: { organization: true, onlineBookingSettings: true }
  });
}

function settingsForLocation(location: (Location & { onlineBookingSettings?: OnlineBookingSettings | null }) | null) {
  const configured = location?.onlineBookingSettings;
  const defaultZips = location?.postalCode ? [normalizeZip(location.postalCode)].filter(Boolean) : [];
  return {
    ...defaultOnlineBookingSettings,
    ...configured,
    serviceAreaZipCodes: configured?.serviceAreaZipCodes.length ? cleanZipList(configured.serviceAreaZipCodes) : defaultZips
  };
}

function timeZoneOffsetMs(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date);
  const offsetName = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(offsetName);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * ((Number(match[2]) * 60 + Number(match[3] ?? "0")) * 60 * 1000);
}

function zonedDateToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const utcGuess = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  return new Date(utcGuess.getTime() - timeZoneOffsetMs(timeZone, utcGuess));
}

function localDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value) - 1,
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
}

async function availableSlots(locationId: string, settings: ReturnType<typeof settingsForLocation>, timeZone: string) {
  const slots = [];
  const now = new Date();
  const today = localDateParts(now, timeZone);
  const rangeStart = zonedDateToUtc(today.year, today.month, today.day, 0, 0, timeZone);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 31);
  const bookedJobs = await prisma.job.findMany({
    where: {
      locationId,
      status: { not: JobStatus.CANCELED },
      scheduledStart: { lt: rangeEnd },
      scheduledEnd: { gt: rangeStart }
    },
    select: { scheduledStart: true, scheduledEnd: true }
  });
  for (let day = 0; day < 30; day += 1) {
    const base = new Date(rangeStart);
    base.setUTCDate(base.getUTCDate() + day);
    const local = localDateParts(base, timeZone);
    for (let minutes = settings.slotStartHour * 60; minutes + settings.slotWindowMinutes <= settings.slotEndHour * 60; minutes += settings.slotIntervalMinutes) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const slotStart = zonedDateToUtc(local.year, local.month, local.day, hour, minute, timeZone);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + settings.slotWindowMinutes);
      if (slotStart <= now) continue;
      const overlaps = bookedJobs.some((job) => job.scheduledStart && job.scheduledEnd && slotStart < job.scheduledEnd && slotEnd > job.scheduledStart);
      if (overlaps) continue;
      slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }
  }
  return slots;
}

bookingRouter.get("/settings", asyncHandler(async (req, res) => {
  const location = await prisma.location.findUnique({
    where: { id: activeLocationId(req) },
    include: { onlineBookingSettings: true }
  });
  if (!location) return res.status(404).json({ error: "Location not found" });
  const services = await prisma.priceBookItem.findMany({
    where: { locationId: location.id, active: true, itemType: "service" },
    orderBy: [{ onlineBooking: "desc" }, { name: "asc" }]
  });
  res.json({
    settings: settingsForLocation(location),
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      onlineBooking: service.onlineBooking
    }))
  });
}));

bookingRouter.patch("/settings", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = settingsSchema.parse(req.body);
  if (input.slotEndHour <= input.slotStartHour) return res.status(422).json({ error: "End hour must be after start hour." });
  const serviceNames = cleanServiceNames(input.serviceNames);
  const settings = await prisma.onlineBookingSettings.upsert({
    where: { locationId },
    create: {
      locationId,
      serviceAreaZipCodes: cleanZipList(input.serviceAreaZipCodes),
      helpHeading: input.helpHeading,
      servicePrompt: input.servicePrompt,
      slotStartHour: input.slotStartHour,
      slotEndHour: input.slotEndHour,
      slotWindowMinutes: input.slotWindowMinutes,
      slotIntervalMinutes: input.slotIntervalMinutes
    },
    update: {
      serviceAreaZipCodes: cleanZipList(input.serviceAreaZipCodes),
      helpHeading: input.helpHeading,
      servicePrompt: input.servicePrompt,
      slotStartHour: input.slotStartHour,
      slotEndHour: input.slotEndHour,
      slotWindowMinutes: input.slotWindowMinutes,
      slotIntervalMinutes: input.slotIntervalMinutes
    }
  });
  await prisma.priceBookItem.updateMany({ where: { locationId, itemType: "service" }, data: { onlineBooking: false } });
  for (const serviceName of serviceNames) {
    const existing = await prisma.priceBookItem.findFirst({
      where: { locationId, itemType: "service", name: { equals: serviceName, mode: "insensitive" } }
    });
    if (existing) {
      await prisma.priceBookItem.update({ where: { id: existing.id }, data: { name: serviceName, active: true, onlineBooking: true } });
    } else {
      await prisma.priceBookItem.create({
        data: { locationId, itemType: "service", name: serviceName, description: serviceName, price: 0, cost: 0, taxable: false, onlineBooking: true }
      });
    }
  }
  const services = await prisma.priceBookItem.findMany({
    where: { locationId, active: true, itemType: "service" },
    orderBy: [{ onlineBooking: "desc" }, { name: "asc" }]
  });
  res.json({
    settings,
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      onlineBooking: service.onlineBooking
    }))
  });
}));

publicBookingRouter.get("/:locationKey", asyncHandler(async (req, res) => {
  const location = await findBookingLocation(String(req.params.locationKey));
  if (!location) return res.status(404).json({ error: "Booking page not found" });
  const settings = settingsForLocation(location);

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
    settings,
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      category: service.category?.name || service.itemType,
      taxable: service.taxable,
      itemType: service.itemType
    })),
    slots: await availableSlots(location.id, settings, location.timezone || "America/Phoenix")
  });
}));

publicBookingRouter.post("/:locationKey", asyncHandler(async (req, res) => {
  const location = await findBookingLocation(String(req.params.locationKey));
  if (!location) return res.status(404).json({ error: "Booking page not found" });
  const input = bookingRequestSchema.parse(req.body);
  const settings = settingsForLocation(location);
  const zip = normalizeZip(input.zipCode);
  if (!zip || !settings.serviceAreaZipCodes.includes(zip)) {
    return res.status(422).json({ error: "We do not currently service that ZIP code. Please call us if you need help outside the listed service area." });
  }
  const slots = await availableSlots(location.id, settings, location.timezone || "America/Phoenix");
  if (!slots.some((slot) => slot.start === input.scheduledStart && slot.end === input.scheduledEnd)) {
    return res.status(422).json({ error: "That appointment time is no longer available. Please choose another time." });
  }
  const service = input.serviceId
    ? await prisma.priceBookItem.findFirst({ where: { id: input.serviceId, locationId: location.id, active: true, onlineBooking: true }, include: { category: true } })
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
          postalCode: zip
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
      internalNotes: `Booked online${input.trackingAttribute ? ` via ${input.trackingAttribute}` : ""}. Zip: ${zip}.`,
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
  if (input.email) {
    const windowText = `${new Date(input.scheduledStart).toLocaleString("en-US", { timeZone: location.timezone || "America/Phoenix", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} - ${new Date(input.scheduledEnd).toLocaleTimeString("en-US", { timeZone: location.timezone || "America/Phoenix", hour: "numeric", minute: "2-digit" })}`;
    await sendEmail({
      locationId: location.id,
      customerId: customer.id,
      jobId: job.id,
      to: input.email,
      subject: `Appointment scheduled with ${location.displayName || location.organization.name || location.name}`,
      body: `Hi ${input.firstName},\n\nYour appointment with ${location.displayName || location.organization.name || location.name} is scheduled for ${windowText}.\n\nService: ${service?.name || input.serviceName}\n\nThank you.`,
      templateKey: "onlineBookingAppointment"
    }).catch(() => undefined);
  }
  res.status(201).json({ jobNumber: job.jobNumber, customerId: customer.id });
}));
