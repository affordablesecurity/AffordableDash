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
      channel: { notIn: ["internal-team", "internal-admin"] }
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ messages });
}));

messagingRouter.get("/internal", asyncHandler(async (req, res) => {
  const isAdminChannelVisible = ["OWNER", "ADMIN"].includes(req.user?.role ?? "");
  const messages = await prisma.message.findMany({
    where: {
      locationId: activeLocationId(req),
      channel: { in: isAdminChannelVisible ? ["internal-team", "internal-admin"] : ["internal-team"] }
    },
    orderBy: { createdAt: "desc" },
    take: 300
  });
  res.json({ messages });
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
    audience: z.enum(["team", "admin"]).default("team"),
    attachments: z.array(z.string().trim().min(1).max(4_000_000)).max(5).default([])
  }).parse(req.body);

  if (input.audience === "admin" && !["OWNER", "ADMIN"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only owners and admins can use the admin message channel." });
  }

  const message = await prisma.message.create({
    data: {
      locationId: activeLocationId(req),
      direction: "OUTBOUND",
      fromNumber: req.user?.id ?? "system",
      toNumber: input.audience,
      body: input.body,
      channel: input.audience === "admin" ? "internal-admin" : "internal-team",
      status: "SENT",
      templateKey: req.user?.username ?? req.user?.email ?? "Team member",
      attachments: input.attachments,
      provider: "internal"
    }
  });

  res.status(201).json({ message });
}));
