import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const settingsRouter = Router();

settingsRouter.get("/summary", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const [
    customers,
    openJobs,
    totalJobs,
    completedJobs,
    canceledJobs,
    leadJobs,
    bookedJobs,
    invoices,
    invoiceTotals,
    paidPayments,
    jobsByTypeRows,
    customersBySourceRows
  ] = await Promise.all([
    prisma.customer.count({ where: { locationId } }),
    prisma.job.count({ where: { locationId, status: { in: ["LEAD", "SCHEDULED", "DISPATCHED", "IN_PROGRESS"] } } }),
    prisma.job.count({ where: { locationId } }),
    prisma.job.count({ where: { locationId, status: "COMPLETED" } }),
    prisma.job.count({ where: { locationId, status: "CANCELED" } }),
    prisma.job.count({ where: { locationId, status: "LEAD" } }),
    prisma.job.count({ where: { locationId, status: { in: ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED"] } } }),
    prisma.invoice.count({ where: { locationId } }),
    prisma.invoice.aggregate({ where: { locationId, status: { not: "VOID" } }, _sum: { total: true }, _avg: { total: true } }),
    prisma.payment.aggregate({ where: { status: "SUCCEEDED", invoice: { locationId } }, _sum: { amount: true } }),
    prisma.job.groupBy({ by: ["jobType"], where: { locationId }, _count: { _all: true } }),
    prisma.customer.groupBy({ by: ["source"], where: { locationId }, _count: { _all: true } })
  ]);

  const salesCents = invoiceTotals._sum.total ?? 0;
  const collectedCents = paidPayments._sum.amount ?? 0;
  const averageJobSizeCents = Math.round(invoiceTotals._avg.total ?? 0);
  const cancellationRate = totalJobs ? canceledJobs / totalJobs : 0;
  const bookingRate = totalJobs ? bookedJobs / totalJobs : 0;
  const closeRate = totalJobs ? completedJobs / totalJobs : 0;
  const jobsByType = jobsByTypeRows.map((row) => ({
    label: row.jobType,
    count: row._count._all,
    percent: totalJobs ? row._count._all / totalJobs : 0
  }));
  const jobsBySource = customersBySourceRows.map((row) => ({
    label: row.source || "Unknown",
    count: row._count._all,
    percent: customers ? row._count._all / customers : 0
  }));

  res.json({
    customers,
    openJobs,
    invoices,
    totalJobs,
    completedJobs,
    canceledJobs,
    leadJobs,
    bookedJobs,
    salesCents,
    collectedCents,
    revenueCents: collectedCents,
    averageJobSizeCents,
    cancellationRate,
    bookingRate,
    closeRate,
    estimateWinRatio: { won: completedJobs, total: invoices },
    jobsByType,
    jobsBySource
  });
}));
