import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const eventsRouter = Router();

const eventSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  eventLocation: z.string().optional(),
  technicianId: z.string().nullable().optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional()
});

const eventPatchSchema = eventSchema.partial();
const eventInclude = { technician: true } as const;

function badRequest(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

function notFound(message: string) {
  return Object.assign(new Error(message), { status: 404 });
}

function validateRange(start?: Date, end?: Date) {
  if (start && end && !(end > start)) throw badRequest("Event end time must be after start time");
}

async function validateTechnician(locationId: string, technicianId?: string | null) {
  if (!technicianId) return;
  const technician = await prisma.technician.findFirst({ where: { id: technicianId, locationId } });
  if (!technician) throw badRequest("Team member not found for this location");
}

eventsRouter.get("/", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const events = await prisma.event.findMany({
    where: { locationId },
    include: eventInclude,
    orderBy: { scheduledStart: "asc" }
  });
  res.json({ events });
}));

eventsRouter.post("/", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const input = eventSchema.parse(req.body);
  const scheduledStart = new Date(input.scheduledStart);
  const scheduledEnd = new Date(input.scheduledEnd);
  validateRange(scheduledStart, scheduledEnd);
  await validateTechnician(locationId, input.technicianId);

  const event = await prisma.event.create({
    data: {
      locationId,
      name: input.name,
      notes: input.notes,
      eventLocation: input.eventLocation,
      technicianId: input.technicianId || null,
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
      scheduledStart,
      scheduledEnd
    },
    include: eventInclude
  });
  res.status(201).json({ event });
}));

eventsRouter.get("/:id", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, locationId },
    include: eventInclude
  });
  if (!event) throw notFound("Event not found");
  res.json({ event });
}));

eventsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const existing = await prisma.event.findFirst({ where: { id: req.params.id, locationId } });
  if (!existing) throw notFound("Event not found");

  const input = eventPatchSchema.parse(req.body);
  const scheduledStart = input.scheduledStart ? new Date(input.scheduledStart) : existing.scheduledStart;
  const scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : existing.scheduledEnd;
  validateRange(scheduledStart, scheduledEnd);
  await validateTechnician(locationId, input.technicianId);

  const event = await prisma.event.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      notes: input.notes,
      eventLocation: input.eventLocation,
      technicianId: input.technicianId === undefined ? undefined : input.technicianId || null,
      latitude: input.latitude === undefined ? undefined : input.latitude,
      longitude: input.longitude === undefined ? undefined : input.longitude,
      scheduledStart,
      scheduledEnd
    },
    include: eventInclude
  });
  res.json({ event });
}));

eventsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const existing = await prisma.event.findFirst({ where: { id: req.params.id, locationId } });
  if (!existing) throw notFound("Event not found");
  await prisma.event.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));
