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
  employmentType: z.enum(["employee", "subcontractor"]).default("employee"),
  role: z.enum(["OWNER", "ADMIN", "INSIDE_SALES", "OUTSIDE_FIELD_TECH"]).default("OUTSIDE_FIELD_TECH"),
  fieldTech: z.boolean().default(true),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().default(true)
});

const rolePermissions: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: ["pricebook:write", "reports:read", "payments:read", "jobs:write", "customers:write", "invoices:write", "employees:write"],
  INSIDE_SALES: ["jobs:write", "customers:write", "invoices:write", "schedule:write"],
  OUTSIDE_FIELD_TECH: ["jobs:write", "customers:write", "invoices:write"]
};

techniciansRouter.get("/", asyncHandler(async (req, res) => {
  const technicians = await prisma.technician.findMany({ where: { locationId: activeLocationId(req) }, orderBy: { name: "asc" } });
  res.json({ technicians });
}));

techniciansRouter.post("/", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can create employees" });
  }
  const input = technicianSchema.parse(req.body);
  const technician = await prisma.technician.create({
    data: { ...input, permissions: input.permissions ?? rolePermissions[input.role], locationId: activeLocationId(req), email: input.email || undefined }
  });
  res.status(201).json({ technician });
}));

techniciansRouter.patch("/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can update employees" });
  }
  const input = technicianSchema.partial().parse(req.body);
  const existing = await prisma.technician.findFirst({ where: { id: String(req.params.id), locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  const technician = await prisma.technician.update({
    where: { id: existing.id },
    data: {
      ...input,
      email: input.email === "" ? null : input.email,
      permissions: input.permissions ?? (input.role ? rolePermissions[input.role] : undefined)
    }
  });
  res.json({ technician });
}));
