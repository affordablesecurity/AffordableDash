import { JobStatus, type Location, type OnlineBookingSettings } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendEmail } from "../messaging/email.service.js";
import { sendJobTemplateSms, sendLocationSms } from "../messaging/messaging.service.js";

export const bookingRouter = Router();
export const publicBookingRouter = Router();

const defaultOnlineBookingSettings = {
  serviceAreaZipCodes: [] as string[],
  helpHeading: "What do you need help with?",
  servicePrompt: "Please select your service",
  headerImageUrl: "",
  heroImageUrl: "",
  contactFields: {
    firstName: "First Name",
    lastName: "Last Name",
    phone: "Phone",
    email: "Email",
    address: "Service address",
    notes: "Additional notes",
    smsConsent: "Receive text messages about appointment"
  },
  flowSteps: {
    zip: "ZIP check",
    service: "Service choice",
    time: "Available slot",
    contact: "Contact details",
    notification: "SMS and email"
  },
  serviceQuestions: {} as Record<string, string[]>,
  slotStartHour: 8,
  slotEndHour: 18,
  slotWindowMinutes: 120,
  slotIntervalMinutes: 120
};

const settingsSchema = z.object({
  serviceAreaZipCodes: z.array(z.string()).default([]),
  helpHeading: z.string().trim().min(1).max(120).default(defaultOnlineBookingSettings.helpHeading),
  servicePrompt: z.string().trim().min(1).max(120).default(defaultOnlineBookingSettings.servicePrompt),
  headerImageUrl: z.string().trim().max(200000).optional().or(z.literal("")),
  heroImageUrl: z.string().trim().max(200000).optional().or(z.literal("")),
  contactFields: z.record(z.string()).default(defaultOnlineBookingSettings.contactFields),
  flowSteps: z.record(z.string()).default(defaultOnlineBookingSettings.flowSteps),
  serviceQuestions: z.record(z.array(z.string())).default({}),
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
  serviceFollowUps: z.array(z.string()).default([]),
  trackingAttribute: z.string().optional(),
  sourceLabel: z.string().optional()
});

type GoogleAddressComponent = { long_name: string; short_name: string; types: string[] };
type GoogleAutocompleteResponse = {
  status: string;
  error_message?: string;
  predictions?: Array<{
    place_id: string;
    description: string;
    structured_formatting?: { main_text?: string; secondary_text?: string };
  }>;
};
type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    place_id: string;
    formatted_address?: string;
    name?: string;
    address_components?: GoogleAddressComponent[];
    geometry?: { location?: { lat: number; lng: number } };
  };
};

function normalizeZip(value?: string | null) {
  return (value ?? "").replace(/\D/g, "").slice(0, 5);
}

function cleanZipList(values: string[]) {
  return [...new Set(values.flatMap((value) => value.split(/[\s,]+/)).map(normalizeZip).filter((value) => value.length === 5))];
}

function cleanServiceNames(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 24);
}

function cleanServiceQuestions(input: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(input)
    .map(([key, values]) => [key.trim(), [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12)])
    .filter(([key, values]) => key && (values as string[]).length)) as Record<string, string[]>;
}

function component(components: GoogleAddressComponent[] = [], type: string, field: "long_name" | "short_name" = "long_name") {
  return components.find((item) => item.types.includes(type))?.[field] ?? "";
}

function normalizePlace(result: NonNullable<GooglePlaceDetailsResponse["result"]>) {
  const components = result.address_components ?? [];
  const streetNumber = component(components, "street_number");
  const route = component(components, "route");
  const subpremise = component(components, "subpremise");
  const city = component(components, "locality") || component(components, "postal_town") || component(components, "administrative_area_level_2");
  const state = component(components, "administrative_area_level_1", "short_name");
  const postalCode = component(components, "postal_code");
  const street1 = [streetNumber, route].filter(Boolean).join(" ") || result.name || result.formatted_address || "";

  return {
    placeId: result.place_id,
    formattedAddress: result.formatted_address ?? street1,
    street1,
    street2: subpremise,
    city,
    state,
    postalCode,
    latitude: result.geometry?.location?.lat,
    longitude: result.geometry?.location?.lng
  };
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
    headerImageUrl: configured?.headerImageUrl ?? "",
    heroImageUrl: configured?.heroImageUrl ?? "",
    contactFields: { ...defaultOnlineBookingSettings.contactFields, ...((configured?.contactFields && typeof configured.contactFields === "object" && !Array.isArray(configured.contactFields)) ? configured.contactFields as Record<string, string> : {}) },
    flowSteps: { ...defaultOnlineBookingSettings.flowSteps, ...((configured?.flowSteps && typeof configured.flowSteps === "object" && !Array.isArray(configured.flowSteps)) ? configured.flowSteps as Record<string, string> : {}) },
    serviceQuestions: cleanServiceQuestions((configured?.serviceQuestions && typeof configured.serviceQuestions === "object" && !Array.isArray(configured.serviceQuestions)) ? configured.serviceQuestions as Record<string, string[]> : {}),
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
  const [technicians, bookedJobs] = await Promise.all([
    prisma.technician.findMany({
      where: { locationId, active: true, fieldTech: true },
      select: { id: true }
    }),
    prisma.job.findMany({
    where: {
      locationId,
      status: { not: JobStatus.CANCELED },
      scheduledStart: { lt: rangeEnd },
      scheduledEnd: { gt: rangeStart }
    },
      select: { scheduledStart: true, scheduledEnd: true, technicianId: true }
    })
  ]);
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
      const hasAvailableTech = technicians.length
        ? technicians.some((tech) => !bookedJobs.some((job) => job.technicianId === tech.id && job.scheduledStart && job.scheduledEnd && slotStart < job.scheduledEnd && slotEnd > job.scheduledStart))
        : !bookedJobs.some((job) => job.scheduledStart && job.scheduledEnd && slotStart < job.scheduledEnd && slotEnd > job.scheduledStart);
      if (!hasAvailableTech) continue;
      slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }
  }
  return slots;
}

async function findAvailableTechnician(locationId: string, scheduledStart: Date, scheduledEnd: Date) {
  const technicians = await prisma.technician.findMany({
    where: { locationId, active: true, fieldTech: true },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, name: true, phone: true, email: true }
  });
  for (const technician of technicians) {
    const overlap = await prisma.job.findFirst({
      where: {
        locationId,
        technicianId: technician.id,
        status: { not: JobStatus.CANCELED },
        scheduledStart: { lt: scheduledEnd },
        scheduledEnd: { gt: scheduledStart }
      },
      select: { id: true }
    });
    if (!overlap) return technician;
  }
  return null;
}

async function slotIsBookable(locationId: string, settings: ReturnType<typeof settingsForLocation>, timeZone: string, scheduledStart: Date, scheduledEnd: Date) {
  if (!(scheduledStart instanceof Date) || !(scheduledEnd instanceof Date) || Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) return { ok: false, technician: null };
  const now = new Date();
  if (scheduledStart <= now || scheduledEnd <= scheduledStart) return { ok: false, technician: null };
  const duration = Math.round((scheduledEnd.getTime() - scheduledStart.getTime()) / 60000);
  if (duration !== settings.slotWindowMinutes) return { ok: false, technician: null };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false
  }).formatToParts(scheduledStart);
  const localHour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const localMinute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const startMinutes = localHour * 60 + localMinute;
  if (startMinutes < settings.slotStartHour * 60 || startMinutes + settings.slotWindowMinutes > settings.slotEndHour * 60) return { ok: false, technician: null };
  if ((startMinutes - settings.slotStartHour * 60) % settings.slotIntervalMinutes !== 0) return { ok: false, technician: null };
  const technician = await findAvailableTechnician(locationId, scheduledStart, scheduledEnd);
  if (technician) return { ok: true, technician };
  const anyFieldTech = await prisma.technician.findFirst({ where: { locationId, active: true, fieldTech: true }, select: { id: true } });
  if (anyFieldTech) return { ok: false, technician: null };
  const locationOverlap = await prisma.job.findFirst({
    where: {
      locationId,
      status: { not: JobStatus.CANCELED },
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart }
    },
    select: { id: true }
  });
  return { ok: !locationOverlap, technician: null };
}

function publicBookingWindow(start: Date, end: Date, timezone: string) {
  return `${start.toLocaleString("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })}`;
}

async function notifyBookingTeam(input: {
  location: NonNullable<Awaited<ReturnType<typeof findBookingLocation>>>;
  jobId: string;
  jobNumber: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  technician: Awaited<ReturnType<typeof findAvailableTechnician>>;
}) {
  const timeZone = input.location.timezone || "America/Phoenix";
  const windowText = publicBookingWindow(input.scheduledStart, input.scheduledEnd, timeZone);
  const companyName = input.location.displayName || input.location.organization.name || input.location.name;
  const subject = `Appointment scheduled: job #${input.jobNumber}`;
  const body = `Appointment scheduled for ${companyName}.\n\nJob #${input.jobNumber}\nCustomer: ${input.customerName}\nPhone: ${input.customerPhone}\nService: ${input.serviceName}\nTime: ${windowText}${input.technician ? `\nTechnician: ${input.technician.name}` : ""}`;
  const memberships = await prisma.userMembership.findMany({
    where: {
      organizationId: input.location.organizationId,
      OR: [{ locationId: input.location.id }, { locationId: null }],
      role: { in: ["OWNER", "ADMIN", "DISPATCHER"] }
    },
    include: { user: true }
  });
  const adminEmails = [...new Set(memberships.map((membership) => membership.user.email).filter(Boolean))];
  await Promise.allSettled(adminEmails.map((email) => sendEmail({
    locationId: input.location.id,
    customerId: input.customerId,
    jobId: input.jobId,
    to: email,
    subject,
    body,
    templateKey: "onlineBookingAdminScheduled"
  })));
  if (input.technician?.email) {
    await sendEmail({
      locationId: input.location.id,
      customerId: input.customerId,
      jobId: input.jobId,
      to: input.technician.email,
      subject,
      body,
      templateKey: "onlineBookingTechnicianScheduled"
    }).catch(() => undefined);
  }
  if (input.technician?.phone) {
    await sendLocationSms({
      locationId: input.location.id,
      customerId: input.customerId,
      jobId: input.jobId,
      to: input.technician.phone,
      body: `New appointment #${input.jobNumber}: ${input.customerName}, ${input.serviceName}, ${windowText}.`,
      templateKey: "onlineBookingTechnicianScheduled"
    }).catch(() => undefined);
  }
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
      headerImageUrl: input.headerImageUrl || null,
      heroImageUrl: input.heroImageUrl || null,
      contactFields: input.contactFields,
      flowSteps: input.flowSteps,
      serviceQuestions: cleanServiceQuestions(input.serviceQuestions),
      slotStartHour: input.slotStartHour,
      slotEndHour: input.slotEndHour,
      slotWindowMinutes: input.slotWindowMinutes,
      slotIntervalMinutes: input.slotIntervalMinutes
    },
    update: {
      serviceAreaZipCodes: cleanZipList(input.serviceAreaZipCodes),
      helpHeading: input.helpHeading,
      servicePrompt: input.servicePrompt,
      headerImageUrl: input.headerImageUrl || null,
      heroImageUrl: input.heroImageUrl || null,
      contactFields: input.contactFields,
      flowSteps: input.flowSteps,
      serviceQuestions: cleanServiceQuestions(input.serviceQuestions),
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

publicBookingRouter.get("/places/autocomplete", asyncHandler(async (req, res) => {
  const input = typeof req.query.input === "string" ? req.query.input.trim() : "";
  if (input.length < 3) {
    res.json({ suggestions: [] });
    return;
  }

  if (!env.GOOGLE_MAPS_API_KEY) {
    res.status(503).json({ error: "Google Maps is not configured. Add GOOGLE_MAPS_API_KEY in Render." });
    return;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:us");
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  if (!response.ok) return res.status(502).json({ error: "Google Places request failed." });
  const data = await response.json() as GoogleAutocompleteResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    return res.status(502).json({ error: data.error_message ?? `Google Places returned ${data.status}.` });
  }

  res.json({
    suggestions: (data.predictions ?? []).map((prediction) => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text,
      secondaryText: prediction.structured_formatting?.secondary_text
    }))
  });
}));

publicBookingRouter.get("/places/details", asyncHandler(async (req, res) => {
  const placeId = typeof req.query.placeId === "string" ? req.query.placeId.trim() : "";
  if (!placeId) return res.status(400).json({ error: "placeId is required." });
  if (!env.GOOGLE_MAPS_API_KEY) {
    res.status(503).json({ error: "Google Maps is not configured. Add GOOGLE_MAPS_API_KEY in Render." });
    return;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "place_id,formatted_address,name,address_component,geometry");
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  if (!response.ok) return res.status(502).json({ error: "Google Place Details request failed." });
  const data = await response.json() as GooglePlaceDetailsResponse;
  if (data.status !== "OK" || !data.result) {
    return res.status(502).json({ error: data.error_message ?? `Google Place Details returned ${data.status}.` });
  }

  res.json({ address: normalizePlace(data.result) });
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
  const scheduledStart = new Date(input.scheduledStart);
  const scheduledEnd = new Date(input.scheduledEnd);
  const bookable = await slotIsBookable(location.id, settings, location.timezone || "America/Phoenix", scheduledStart, scheduledEnd);
  if (!bookable.ok) {
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
      technicianId: bookable.technician?.id,
      title: input.serviceName,
      jobType: service?.category?.name || input.serviceName,
      leadSource: source,
      tags: ["Online Booking", ...(input.trackingAttribute ? [`attr:${input.trackingAttribute}`] : [])],
      status: JobStatus.SCHEDULED,
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: new Date(input.scheduledEnd),
      description: [input.notes, input.serviceFollowUps.length ? `Selected needs: ${input.serviceFollowUps.join(", ")}` : ""].filter(Boolean).join("\n\n"),
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
  await notifyBookingTeam({
    location,
    jobId: job.id,
    jobNumber: job.jobNumber,
    customerId: customer.id,
    customerName: `${customer.firstName} ${customer.lastName}`.trim(),
    customerPhone: customer.phone,
    serviceName: service?.name || input.serviceName,
    scheduledStart,
    scheduledEnd,
    technician: bookable.technician
  }).catch(() => undefined);
  if (input.email) {
    const windowText = publicBookingWindow(scheduledStart, scheduledEnd, location.timezone || "America/Phoenix");
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
