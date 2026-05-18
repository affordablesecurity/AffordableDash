import { EstimateStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { sendEmail } from "../messaging/email.service.js";
import { sendLocationSms } from "../messaging/messaging.service.js";

const reminderIntervalMs = 24 * 60 * 60 * 1000;
let reminderTimer: ReturnType<typeof setInterval> | null = null;
let reminderRunning = false;

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function estimateReminderUrl(estimateNumber: number) {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/e/${estimateNumber}`;
}

function businessName(estimate: { location: { displayName: string | null; name: string; organization?: { name: string } | null } }) {
  return estimate.location.organization?.name || estimate.location.displayName || estimate.location.name || "Affordable Security";
}

function estimateReminderText(estimate: { estimateNumber: number }) {
  return `Reminder: estimate #${estimate.estimateNumber} is ready: ${estimateReminderUrl(estimate.estimateNumber)}`;
}

function estimateReminderEmail(estimate: { estimateNumber: number; customer: { firstName: string; companyName: string | null }; location: { displayName: string | null; name: string; organization?: { name: string } | null } }) {
  const firstName = estimate.customer.firstName || estimate.customer.companyName || "there";
  const business = businessName(estimate);
  return `Hi ${firstName},\n\nThis is a reminder that estimate #${estimate.estimateNumber} from ${business} is ready for review.\n\nView estimate: ${estimateReminderUrl(estimate.estimateNumber)}\n\nYou can approve or decline the estimate from that link.`;
}

export async function runEstimateReminderSweep() {
  if (reminderRunning) return;
  reminderRunning = true;
  try {
    const since = startOfToday();
    const estimates = await prisma.estimate.findMany({
      where: { status: EstimateStatus.SENT },
      include: { customer: true, location: { include: { organization: true } } },
      orderBy: { updatedAt: "asc" },
      take: 100
    });

    for (const estimate of estimates) {
      const alreadyReminded = await prisma.message.findFirst({
        where: {
          locationId: estimate.locationId,
          customerId: estimate.customerId,
          templateKey: { in: ["estimateReminderSms", "estimateReminderEmail"] },
          createdAt: { gte: since }
        },
        select: { id: true }
      });
      if (alreadyReminded) continue;

      const deliveries: Promise<unknown>[] = [];
      deliveries.push(sendLocationSms({
        locationId: estimate.locationId,
        customerId: estimate.customerId,
        to: estimate.customer.phone,
        body: estimateReminderText(estimate),
        templateKey: "estimateReminderSms",
        customer: estimate.customer
      }));
      if (estimate.customer.email) {
        deliveries.push(sendEmail({
          locationId: estimate.locationId,
          customerId: estimate.customerId,
          to: estimate.customer.email,
          subject: `Reminder: estimate #${estimate.estimateNumber} is ready`,
          body: estimateReminderEmail(estimate),
          templateKey: "estimateReminderEmail"
        }));
      }
      await Promise.allSettled(deliveries);
    }
  } finally {
    reminderRunning = false;
  }
}

export function startEstimateReminderScheduler() {
  if (reminderTimer) return;
  reminderTimer = setInterval(() => {
    runEstimateReminderSweep().catch((error) => {
      console.error("Estimate reminder sweep failed", error);
    });
  }, reminderIntervalMs);
  runEstimateReminderSweep().catch((error) => {
    console.error("Estimate reminder sweep failed", error);
  });
}
