import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendSms } from "./voipms.service.js";

export const messagingRouter = Router();

messagingRouter.get("/", asyncHandler(async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { locationId: activeLocationId(req) },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ messages });
}));

messagingRouter.post("/sms", asyncHandler(async (req, res) => {
  const input = z.object({
    customerId: z.string().optional(),
    to: z.string().min(7),
    body: z.string().min(1).max(1500)
  }).parse(req.body);
  const locationId = activeLocationId(req);

  const result = await sendSms(input.to, input.body);
  const message = await prisma.message.create({
    data: {
      locationId,
      customerId: input.customerId,
      direction: "OUTBOUND",
      fromNumber: env.VOIPMS_DID || "",
      toNumber: input.to,
      body: input.body,
      providerRef: typeof result.sms === "string" ? result.sms : undefined
    }
  });

  res.status(201).json({ message, provider: result });
}));
