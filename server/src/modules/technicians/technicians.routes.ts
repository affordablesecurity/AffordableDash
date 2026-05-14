import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const techniciansRouter = Router();

const technicianSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  username: z.string().trim().toLowerCase().min(3).regex(/^[a-z0-9._-]+$/).optional().or(z.literal("")),
  password: z.string().min(8).optional().or(z.literal("")),
  phone: z.string().min(7),
  color: z.string().default("#2563eb"),
  employmentType: z.enum(["employee", "subcontractor"]).default("employee"),
  role: z.enum(["OWNER", "ADMIN", "INSIDE_SALES", "OUTSIDE_FIELD_TECH"]).default("OUTSIDE_FIELD_TECH"),
  fieldTech: z.boolean().default(true),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().default(true),
  newLocation: z.object({
    name: z.string().min(1),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional().or(z.literal("")),
    phone: z.string().optional(),
    street1: z.string().optional(),
    street2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    timezone: z.string().default("America/Phoenix")
  }).optional()
});

const rolePermissions: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: ["pricebook:write", "reports:read", "payments:read", "jobs:write", "customers:write", "invoices:write", "employees:write"],
  INSIDE_SALES: ["jobs:write", "customers:write", "invoices:write", "schedule:write"],
  OUTSIDE_FIELD_TECH: ["jobs:write", "customers:write", "invoices:write"]
};

const membershipRoleByEmployeeRole: Record<string, "OWNER" | "ADMIN" | "DISPATCHER" | "TECHNICIAN"> = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  INSIDE_SALES: "DISPATCHER",
  OUTSIDE_FIELD_TECH: "TECHNICIAN"
};

function usernameFromEmail(email: string) {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || `user-${Date.now().toString(36)}`;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function ensureMembershipRoster(locationId: string) {
  const memberships = await prisma.userMembership.findMany({
    where: { locationId },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });

  await Promise.all(memberships.map(async (membership) => {
    const existing = await prisma.technician.findFirst({ where: { locationId, userId: membership.userId } });
    const role = membership.role === "TECHNICIAN" ? "OUTSIDE_FIELD_TECH" : membership.role === "DISPATCHER" ? "INSIDE_SALES" : membership.role;
    const data = {
      name: membership.user.name,
      email: membership.user.email,
      phone: membership.user.phone || existing?.phone || "Not set",
      employmentType: "employee",
      role,
      fieldTech: role === "OUTSIDE_FIELD_TECH",
      permissions: rolePermissions[role],
      active: membership.user.active
    };
    if (existing) {
      await prisma.technician.update({ where: { id: existing.id }, data });
    } else {
      await prisma.technician.create({ data: { ...data, userId: membership.userId, locationId } });
    }
  }));
}

techniciansRouter.get("/", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  await ensureMembershipRoster(locationId);
  const technicians = await prisma.technician.findMany({ where: { locationId }, orderBy: { name: "asc" } });
  res.json({ technicians });
}));

techniciansRouter.post("/", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can create employees" });
  }
  const input = technicianSchema.parse(req.body);
  let locationId = activeLocationId(req);
  const cleanEmail = input.email || undefined;
  const membershipRole = membershipRoleByEmployeeRole[input.role];
  if (input.newLocation?.name && (!cleanEmail || !input.password)) {
    return res.status(400).json({ error: "New location owners need an email and temporary password" });
  }
  const result = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    let createdLocation: any = null;

    if (input.newLocation?.name) {
      const locationSlug = input.newLocation.slug || slugify(input.newLocation.name);
      createdLocation = await tx.location.create({
        data: {
          organizationId: req.user!.organizationId,
          name: input.newLocation.name,
          slug: locationSlug,
          phone: input.newLocation.phone,
          street1: input.newLocation.street1,
          street2: input.newLocation.street2,
          city: input.newLocation.city,
          state: input.newLocation.state,
          postalCode: input.newLocation.postalCode,
          timezone: input.newLocation.timezone
        }
      });
      locationId = createdLocation.id;

      await tx.userMembership.upsert({
        where: { userId_organizationId_locationId: { userId: req.user!.id, organizationId: req.user!.organizationId, locationId } },
        create: {
          userId: req.user!.id,
          organizationId: req.user!.organizationId,
          locationId,
          role: req.user!.role === "OWNER" ? "OWNER" : "ADMIN"
        },
        update: { role: req.user!.role === "OWNER" ? "OWNER" : "ADMIN" }
      });
    }

    if (cleanEmail && input.password) {
      const existingUser = await tx.user.findUnique({ where: { email: cleanEmail } });
      if (existingUser) {
        userId = existingUser.id;
        await tx.user.update({
          where: { id: existingUser.id },
          data: { name: input.name, phone: input.phone, active: input.active }
        });
      } else {
        const username = input.username || usernameFromEmail(cleanEmail);
        const passwordHash = await bcrypt.hash(input.password, 12);
        const user = await tx.user.create({
          data: {
            email: cleanEmail,
            username,
            name: input.name,
            phone: input.phone,
            passwordHash,
            role: membershipRole,
            active: input.active
          }
        });
        userId = user.id;
      }

      await tx.userMembership.upsert({
        where: { userId_organizationId_locationId: { userId, organizationId: req.user!.organizationId, locationId } },
        create: { userId, organizationId: req.user!.organizationId, locationId, role: membershipRole },
        update: { role: membershipRole }
      });
    }

    const technicianData = {
      userId,
      name: input.name,
      phone: input.phone,
      color: input.color,
      employmentType: input.employmentType,
      role: input.role,
      fieldTech: input.fieldTech,
      active: input.active,
      permissions: input.permissions ?? rolePermissions[input.role],
      locationId,
      email: cleanEmail
    };
    const existingTechnician = userId ? await tx.technician.findFirst({ where: { userId, locationId } }) : null;
    if (existingTechnician) {
      const technician = await tx.technician.update({
        where: { id: existingTechnician.id },
        data: technicianData
      });
      return { technician, location: createdLocation };
    }

    const technician = await tx.technician.create({
      data: technicianData
    });
    return { technician, location: createdLocation };
  });
  res.status(201).json(result);
}));

techniciansRouter.patch("/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can update employees" });
  }
  const input = technicianSchema.partial().parse(req.body);
  const existing = await prisma.technician.findFirst({ where: { id: String(req.params.id), locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  const { username: _username, password: _password, newLocation: _newLocation, ...technicianInput } = input;
  const technician = await prisma.technician.update({
    where: { id: existing.id },
    data: {
      ...technicianInput,
      email: input.email === "" ? null : input.email,
      permissions: input.permissions ?? (input.role ? rolePermissions[input.role] : undefined)
    }
  });

  if (technician.userId) {
    await prisma.user.update({
      where: { id: technician.userId },
      data: {
        name: technician.name,
        email: technician.email || undefined,
        phone: technician.phone,
        active: technician.active
      }
    });
    if (input.role) {
      await prisma.userMembership.updateMany({
        where: { userId: technician.userId, locationId: technician.locationId },
        data: { role: membershipRoleByEmployeeRole[input.role] }
      });
    }
  }
  res.json({ technician });
}));
