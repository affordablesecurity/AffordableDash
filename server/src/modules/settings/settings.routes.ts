import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const settingsRouter = Router();

settingsRouter.get("/summary", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const [customers, openJobs, invoices, paidPayments] = await Promise.all([
    prisma.customer.count({ where: { locationId } }),
    prisma.job.count({ where: { locationId, status: { in: ["LEAD", "SCHEDULED", "DISPATCHED", "IN_PROGRESS"] } } }),
    prisma.invoice.count({ where: { locationId } }),
    prisma.payment.aggregate({ where: { status: "SUCCEEDED", invoice: { locationId } }, _sum: { amount: true } })
  ]);

  res.json({
    customers,
    openJobs,
    invoices,
    revenueCents: paidPayments._sum.amount ?? 0
  });
}));
