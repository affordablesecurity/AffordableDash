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
  active: z.boolean().default(true)
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
  const locationId = activeLocationId(req);
  const cleanEmail = input.email || undefined;
  const membershipRole = membershipRoleByEmployeeRole[input.role];
  const result = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
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
      return tx.technician.update({
        where: { id: existingTechnician.id },
        data: technicianData
      });
    }

    return tx.technician.create({
      data: technicianData
    });
  });
  res.status(201).json({ technician: result });
}));

techniciansRouter.patch("/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can update employees" });
  }
  const input = technicianSchema.partial().parse(req.body);
  const existing = await prisma.technician.findFirst({ where: { id: String(req.params.id), locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  const { username: _username, password: _password, ...technicianInput } = input;
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
