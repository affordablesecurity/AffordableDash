import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { Router } from "express";
import { z } from "zod";
import type { Prisma, Technician as TechnicianRecord } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { sendEmail } from "../messaging/email.service.js";
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
  locationIds: z.array(z.string()).optional(),
  allLocations: z.boolean().optional(),
  newLocation: z.object({
    name: z.string().min(1),
    displayName: z.string().optional(),
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

type MembershipRole = "OWNER" | "ADMIN" | "DISPATCHER" | "TECHNICIAN";
type LocationSummary = { id: string; name: string; displayName: string | null };

const membershipRoleByEmployeeRole: Record<string, MembershipRole> = {
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

async function organizationLocations(organizationId: string) {
  return prisma.location.findMany({
    where: { organizationId, active: true },
    select: { id: true, name: true, displayName: true },
    orderBy: { createdAt: "asc" }
  });
}

async function canManageOrganizationLocations(user: { id: string; role: string; organizationId: string }) {
  const membership = await prisma.userMembership.findFirst({
    where: {
      userId: user.id,
      organizationId: user.organizationId,
      locationId: null,
      role: { in: ["OWNER", "ADMIN"] }
    },
    select: { id: true }
  });
  return Boolean(membership);
}

async function enrichTechnicians<T extends { userId: string | null; locationId: string }>(technicians: T[], organizationId: string) {
  const userIds = [...new Set(technicians.map((technician) => technician.userId).filter(Boolean) as string[])];
  const [memberships, orgLocations, users] = await Promise.all([
    userIds.length ? prisma.userMembership.findMany({
      where: { organizationId, userId: { in: userIds } },
      include: { location: { select: { id: true, name: true, displayName: true } } },
      orderBy: { createdAt: "asc" }
    }) : Promise.resolve([]),
    organizationLocations(organizationId),
    userIds.length ? prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true }
    }) : Promise.resolve([])
  ]);
  const usernameByUserId = new Map(users.map((user) => [user.id, user.username]));

  return technicians.map((technician) => {
    const userMemberships = memberships.filter((membership) => membership.userId === technician.userId);
    const allLocations = userMemberships.some((membership) => !membership.locationId && ["OWNER", "ADMIN"].includes(membership.role));
    const locationAccess = allLocations
      ? orgLocations
      : userMemberships.map((membership) => membership.location).filter((location): location is LocationSummary => Boolean(location));
    return { ...technician, username: technician.userId ? usernameByUserId.get(technician.userId) : undefined, allLocations, locationAccess };
  });
}

async function syncLocationAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  organizationId: string,
  membershipRole: MembershipRole,
  options: { allLocations?: boolean; locationIds: string[] }
) {
  const canUseOrgWideAccess = Boolean(options.allLocations && ["OWNER", "ADMIN"].includes(membershipRole));
  const globalMembership = await tx.userMembership.findFirst({ where: { userId, organizationId, locationId: null } });

  if (canUseOrgWideAccess) {
    if (globalMembership) {
      await tx.userMembership.update({ where: { id: globalMembership.id }, data: { role: membershipRole } });
    } else {
      await tx.userMembership.create({ data: { userId, organizationId, role: membershipRole } });
    }
    return;
  }

  if (globalMembership) {
    await tx.userMembership.delete({ where: { id: globalMembership.id } });
  }

  const exactMemberships = await tx.userMembership.findMany({ where: { userId, organizationId } });
  await Promise.all(exactMemberships
    .filter((membership) => membership.locationId && !options.locationIds.includes(membership.locationId))
    .map((membership) => tx.userMembership.delete({ where: { id: membership.id } })));

  for (const locationId of options.locationIds) {
    await tx.userMembership.upsert({
      where: { userId_organizationId_locationId: { userId, organizationId, locationId } },
      create: { userId, organizationId, locationId, role: membershipRole },
      update: { role: membershipRole }
    });
  }
}

techniciansRouter.get("/", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  await ensureMembershipRoster(locationId);
  const technicians = await prisma.technician.findMany({ where: { locationId }, orderBy: { name: "asc" } });
  const enriched = await enrichTechnicians(technicians, req.user!.organizationId);
  const canManageAllLocations = await canManageOrganizationLocations(req.user!);
  res.json({ technicians: canManageAllLocations ? enriched : enriched.filter((technician) => !technician.allLocations) });
}));

techniciansRouter.post("/", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can create employees" });
  }
  const input = technicianSchema.parse(req.body);
  let locationId = activeLocationId(req);
  const canManageAllLocations = await canManageOrganizationLocations(req.user!);
  if (input.role === "ADMIN" && !canManageAllLocations) {
    return res.status(403).json({ error: "Only super admins can create another super admin" });
  }
  if (input.newLocation?.name && !canManageAllLocations) {
    return res.status(403).json({ error: "Only organization owners and super admins can create locations" });
  }
  if (input.newLocation?.name && input.role !== "OWNER") {
    return res.status(400).json({ error: "New location creation must use the location owner role" });
  }
  let targetLocationIds = Array.from(new Set(input.locationIds?.length ? input.locationIds : [locationId]));
  if (!canManageAllLocations) {
    targetLocationIds = [locationId];
  }
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
          displayName: input.newLocation.displayName || input.newLocation.name,
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
      targetLocationIds = [locationId];

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

    if (canManageAllLocations && input.allLocations && ["OWNER", "ADMIN"].includes(membershipRole)) {
      const orgLocations = await tx.location.findMany({
        where: { organizationId: req.user!.organizationId, active: true },
        select: { id: true }
      });
      targetLocationIds = orgLocations.map((location) => location.id);
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

      await syncLocationAccess(tx, userId, req.user!.organizationId, membershipRole, {
        allLocations: canManageAllLocations && input.allLocations,
        locationIds: targetLocationIds
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
      email: cleanEmail
    };
    let primaryTechnician: TechnicianRecord | null = null;
    for (const targetLocationId of targetLocationIds) {
      const existingTechnician = userId ? await tx.technician.findFirst({ where: { userId, locationId: targetLocationId } }) : null;
      const technician = existingTechnician
        ? await tx.technician.update({
          where: { id: existingTechnician.id },
          data: { ...technicianData, locationId: targetLocationId }
        })
        : await tx.technician.create({
          data: { ...technicianData, locationId: targetLocationId }
        });
      if (targetLocationId === activeLocationId(req) || !primaryTechnician) primaryTechnician = technician;
    }

    return { technician: primaryTechnician, location: createdLocation };
  });
  const [technician] = result.technician ? await enrichTechnicians([result.technician], req.user!.organizationId) : [result.technician];
  res.status(201).json({ ...result, technician });
}));

techniciansRouter.patch("/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can update employees" });
  }
  const input = technicianSchema.partial().parse(req.body);
  const canManageAllLocations = await canManageOrganizationLocations(req.user!);
  if (input.role === "ADMIN" && !canManageAllLocations) {
    return res.status(403).json({ error: "Only super admins can assign the super admin role" });
  }
  const existing = await prisma.technician.findFirst({ where: { id: String(req.params.id), locationId: activeLocationId(req) } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });
  const { username: _username, password: _password, newLocation: _newLocation, locationIds, allLocations, ...technicianInput } = input;
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
    if (typeof allLocations === "boolean" || Array.isArray(locationIds)) {
      const membershipRole = input.role ? membershipRoleByEmployeeRole[input.role] : membershipRoleByEmployeeRole[technician.role] ?? "TECHNICIAN";
      let targetLocationIds = Array.from(new Set(locationIds?.length ? locationIds : [technician.locationId]));
      if (!canManageAllLocations) {
        targetLocationIds = [technician.locationId];
      }
      if (canManageAllLocations && allLocations && ["OWNER", "ADMIN"].includes(membershipRole)) {
        const orgLocations = await prisma.location.findMany({
          where: { organizationId: req.user!.organizationId, active: true },
          select: { id: true }
        });
        targetLocationIds = orgLocations.map((location) => location.id);
      }
      await prisma.$transaction(async (tx) => {
        await syncLocationAccess(tx, technician.userId!, req.user!.organizationId, membershipRole, {
          allLocations: canManageAllLocations && allLocations,
          locationIds: targetLocationIds
        });
        for (const targetLocationId of targetLocationIds) {
          const existingTarget = await tx.technician.findFirst({
            where: { userId: technician.userId, locationId: targetLocationId }
          });
          const technicianData = {
            name: technician.name,
            email: technician.email,
            phone: technician.phone,
            color: technician.color,
            employmentType: technician.employmentType,
            role: technician.role,
            fieldTech: technician.fieldTech,
            active: technician.active,
            permissions: technician.permissions
          };
          if (existingTarget) {
            await tx.technician.update({ where: { id: existingTarget.id }, data: technicianData });
          } else {
            await tx.technician.create({
              data: { ...technicianData, userId: technician.userId, locationId: targetLocationId }
            });
          }
        }
      });
    }
  }
  const [enriched] = await enrichTechnicians([technician], req.user!.organizationId);
  res.json({ technician: enriched });
}));

techniciansRouter.post("/:id/password-reset", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can send password resets" });
  }
  const technician = await prisma.technician.findFirst({ where: { id: String(req.params.id), locationId: activeLocationId(req) } });
  if (!technician) return res.status(404).json({ error: "Employee not found" });
  if (!technician.userId || !technician.email) {
    return res.status(400).json({ error: "This employee does not have a portal login email" });
  }
  const user = await prisma.user.findUnique({ where: { id: technician.userId } });
  if (!user) return res.status(404).json({ error: "Portal user not found" });

  const temporaryPassword = `Temp-${randomBytes(6).toString("base64url")}1!`;
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const delivery = await sendEmail({
    locationId: activeLocationId(req),
    to: technician.email,
    subject: "Your Affordable Security CRM password reset",
    body: [
      `Hi ${technician.name},`,
      "",
      "Your Affordable Security CRM login was reset.",
      `Username: ${user.username}`,
      `Temporary password: ${temporaryPassword}`,
      "",
      "Sign in with this temporary password. An admin can send another reset if you need a new one."
    ].join("\n"),
    templateKey: "employeePasswordReset"
  });
  if (delivery.status !== "SENT") {
    return res.status(502).json({ error: delivery.error || "Password reset email could not be sent" });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, active: true } });

  res.json({ ok: true, username: user.username });
}));

techniciansRouter.delete("/:id", asyncHandler(async (req, res) => {
  if (!["OWNER", "ADMIN"].includes(req.user!.role)) {
    return res.status(403).json({ error: "Only owners and admins can delete employees" });
  }
  const locationId = activeLocationId(req);
  const existing = await prisma.technician.findFirst({ where: { id: String(req.params.id), locationId } });
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  const canManageAllLocations = await canManageOrganizationLocations(req.user!);
  const memberships = existing.userId ? await prisma.userMembership.findMany({
    where: { userId: existing.userId, organizationId: req.user!.organizationId },
    select: { id: true, locationId: true, role: true }
  }) : [];
  const hasOrganizationWideAccess = memberships.some((membership) => !membership.locationId && ["OWNER", "ADMIN"].includes(membership.role));
  const isLocationOwner = existing.role === "OWNER" && !hasOrganizationWideAccess;
  const isStaff = existing.role !== "OWNER" && !hasOrganizationWideAccess;

  if (hasOrganizationWideAccess) {
    return res.status(403).json({ error: "Super admins cannot be deleted from a location" });
  }
  if (!canManageAllLocations && !isStaff) {
    return res.status(403).json({ error: "Location owners can only delete staff in their own location" });
  }
  if (canManageAllLocations && !isLocationOwner && !isStaff) {
    return res.status(403).json({ error: "This employee cannot be deleted" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.technician.delete({ where: { id: existing.id } });
    if (!existing.userId) return;

    await tx.userMembership.deleteMany({
      where: {
        userId: existing.userId,
        organizationId: req.user!.organizationId,
        locationId
      }
    });
    const remainingMemberships = await tx.userMembership.count({
      where: { userId: existing.userId, organizationId: req.user!.organizationId }
    });
    if (remainingMemberships === 0) {
      await tx.user.update({ where: { id: existing.userId }, data: { active: false } });
    }
  });

  res.json({ ok: true });
}));
