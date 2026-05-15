import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  getMessagingSettings,
  saveMessagingSettings,
  sendLocationSms,
  type MessagingTemplateKey
} from "./messaging.service.js";

export const messagingRouter = Router();

const messagingTemplateKeys = [
  "appointmentScheduled",
  "onMyWay",
  "workStarted",
  "jobCompleted",
  "invoiceSent",
  "paymentReceived"
] as const satisfies readonly MessagingTemplateKey[];

const templateKeySchema = z.enum(messagingTemplateKeys);

const messagingSettingsSchema = z.object({
  smsEnabled: z.boolean().optional(),
  username: z.string().trim().optional(),
  apiPassword: z.string().optional(),
  defaultDid: z.string().trim().optional(),
  areaCode: z.string().trim().optional(),
  availableDids: z.array(z.string().trim()).optional(),
  autoSend: z.record(templateKeySchema, z.boolean()).optional(),
  templates: z.record(templateKeySchema, z.string().trim().min(1).max(500)).optional(),
  reviewEmail: z.object({
    enabled: z.boolean().optional(),
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().max(1000).optional()
  }).optional()
});

messagingRouter.get("/", asyncHandler(async (req, res) => {
  const messages = await prisma.message.findMany({
    where: {
      locationId: activeLocationId(req),
      channel: { notIn: ["internal-team", "internal-admin", "internal-direct"] }
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ messages });
}));

messagingRouter.get("/internal", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const userId = req.user?.id ?? "";
  const isAdminChannelVisible = ["OWNER", "ADMIN"].includes(req.user?.role ?? "");
  const messages = await prisma.message.findMany({
    where: isAdminChannelVisible ? {
      locationId,
      channel: { in: ["internal-team", "internal-admin", "internal-direct"] }
    } : {
      locationId,
      OR: [
        { channel: "internal-team" },
        { channel: "internal-direct", OR: [{ fromNumber: userId }, { toNumber: userId }] }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 300
  });
  res.json({ messages });
}));

messagingRouter.get("/internal/recipients", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { organizationId: true }
  });
  if (!location) return res.status(404).json({ error: "Location not found" });

  const memberships = await prisma.userMembership.findMany({
    where: {
      organizationId: location.organizationId,
      OR: [{ locationId }, { locationId: null }],
      user: { active: true }
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          phone: true,
          role: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const technicians = await prisma.technician.findMany({
    where: {
      locationId,
      userId: { in: memberships.map((membership) => membership.userId) },
      active: true
    },
    select: { id: true, userId: true, fieldTech: true, role: true }
  });
  const technicianByUserId = new Map(technicians.flatMap((technician) => (
    technician.userId ? [[technician.userId, technician]] : []
  )));

  const recipients = new Map<string, {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    kind: string;
    technicianId: string | null;
    fieldTech: boolean;
  }>();

  for (const membership of memberships) {
    const user = membership.user;
    if (user.id === req.user?.id) continue;
    const technician = technicianByUserId.get(user.id);
    recipients.set(user.id, {
      id: user.id,
      name: user.name || user.email || user.username || "Team member",
      email: user.email,
      phone: user.phone,
      role: membership.role,
      kind: technician?.fieldTech ? "Field tech" : membership.role,
      technicianId: technician?.id ?? null,
      fieldTech: Boolean(technician?.fieldTech)
    });
  }

  res.json({ recipients: [...recipients.values()].sort((a, b) => a.name.localeCompare(b.name)) });
}));

messagingRouter.get("/settings", asyncHandler(async (req, res) => {
  const settings = await getMessagingSettings(activeLocationId(req));
  res.json({ settings });
}));

messagingRouter.patch("/settings", asyncHandler(async (req, res) => {
  const input = messagingSettingsSchema.parse(req.body);
  const settings = await saveMessagingSettings(activeLocationId(req), input);
  res.json({ settings });
}));

messagingRouter.post("/sms", asyncHandler(async (req, res) => {
  const input = z.object({
    customerId: z.string().optional(),
    jobId: z.string().optional(),
    invoiceId: z.string().optional(),
    to: z.string().min(7),
    body: z.string().min(1).max(1500),
    attachments: z.array(z.string().trim().min(1).max(4_000_000)).max(5).default([])
  }).parse(req.body);
  const locationId = activeLocationId(req);

  const customer = input.customerId
    ? await prisma.customer.findFirst({ where: { id: input.customerId, locationId }, select: { communicationPrefs: true } })
    : null;
  const message = await sendLocationSms({
    locationId,
    customerId: input.customerId,
    jobId: input.jobId,
    invoiceId: input.invoiceId,
    to: input.to,
    body: input.body,
    attachments: input.attachments,
    customer
  });

  res.status(201).json({ message });
}));

messagingRouter.post("/internal", asyncHandler(async (req, res) => {
  const input = z.object({
    body: z.string().trim().min(1).max(2500),
    audience: z.enum(["team", "admin", "direct"]).default("team"),
    recipientUserId: z.string().optional(),
    attachments: z.array(z.string().trim().min(1).max(4_000_000)).max(5).default([])
  }).parse(req.body);
  const locationId = activeLocationId(req);

  if (input.audience === "admin" && !["OWNER", "ADMIN"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only owners and admins can use the admin message channel." });
  }

  let recipient: { id: string; name: string | null; email: string | null; username: string | null } | null = null;
  if (input.audience === "direct") {
    if (!input.recipientUserId) return res.status(400).json({ error: "Choose a person to message." });
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { organizationId: true }
    });
    if (!location) return res.status(404).json({ error: "Location not found" });
    const membership = await prisma.userMembership.findFirst({
      where: {
        userId: input.recipientUserId,
        organizationId: location.organizationId,
        OR: [{ locationId }, { locationId: null }],
        user: { active: true }
      },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } }
      }
    });
    if (!membership) return res.status(404).json({ error: "That person does not have access to this location." });
    recipient = membership.user;
  }

  const message = await prisma.message.create({
    data: {
      locationId,
      direction: "OUTBOUND",
      fromNumber: req.user?.id ?? "system",
      toNumber: recipient?.id ?? input.audience,
      body: input.body,
      channel: input.audience === "admin" ? "internal-admin" : input.audience === "direct" ? "internal-direct" : "internal-team",
      status: "SENT",
      templateKey: req.user?.username ?? req.user?.email ?? "Team member",
      attachments: input.attachments,
      provider: "internal",
      providerRef: recipient ? (recipient.name || recipient.email || recipient.username || "Team member") : undefined
    }
  });

  res.status(201).json({ message });
}));
