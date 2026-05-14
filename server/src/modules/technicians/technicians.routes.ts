import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const techniciansRouter = Router();

const technicianSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(7),
  color: z.string().default("#2563eb"),
  active: z.boolean().default(true)
});

techniciansRouter.get("/", asyncHandler(async (req, res) => {
  const technicians = await prisma.technician.findMany({ where: { locationId: activeLocationId(req) }, orderBy: { name: "asc" } });
  res.json({ technicians });
}));

techniciansRouter.post("/", asyncHandler(async (req, res) => {
  const input = technicianSchema.parse(req.body);
  const technician = await prisma.technician.create({
    data: { ...input, locationId: activeLocationId(req), email: input.email || undefined }
  });
  res.status(201).json({ technician });
}));
