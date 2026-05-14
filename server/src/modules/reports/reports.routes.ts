import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { activeLocationId } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const reportsRouter = Router();

type ReportRow = { label: string; value: string; detail?: string };
type ReportItem = { id: string; label: string; value: string; detail: string; rows: ReportRow[] };
type ChartBar = { label: string; value: number; previousValue?: number };
type DashboardChart = { id: string; title: string; metricLabel: string; metricValue: string; format: "money" | "number"; bars: ChartBar[] };

function cents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function percent(value: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function dateKey(date: Date, mode: "day" | "week" | "month" | "quarter" | "year" | "daily" | "weekly" | "monthly") {
  if (mode === "daily") return dateKey(date, "day");
  if (mode === "weekly") return dateKey(date, "week");
  if (mode === "monthly") return dateKey(date, "month");
  if (mode === "year") return String(date.getUTCFullYear());
  if (mode === "quarter") return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  if (mode === "month") return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  if (mode === "week") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    return `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function rangeBounds(range: string) {
  const now = new Date();
  const today = startOfUtcDay(now);
  const tomorrow = addDays(today, 1);
  if (range === "today") return { start: today, end: tomorrow };
  if (range === "weekToDate") return { start: addDays(today, -today.getUTCDay()), end: tomorrow };
  if (range === "quarterToDate") return { start: new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3, 1)), end: tomorrow };
  if (range === "yearToDate") return { start: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), end: tomorrow };
  if (range === "lastWeek") {
    const thisWeek = addDays(today, -today.getUTCDay());
    return { start: addDays(thisWeek, -7), end: thisWeek };
  }
  if (range === "lastMonth") {
    const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { start: addMonths(thisMonth, -1), end: thisMonth };
  }
  if (range === "lastYear") return { start: new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1)), end: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)) };
  return { start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), end: tomorrow };
}

function addRow(group: Map<string, number>, key: string, value: number) {
  group.set(key, (group.get(key) ?? 0) + value);
}

function countRows(group: Map<string, number>): ReportRow[] {
  return [...group.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value: String(value) }));
}

function moneyRows(group: Map<string, number>): ReportRow[] {
  return [...group.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value: cents(value) }));
}

function chartRows(group: Map<string, number>, previousGroup?: Map<string, number>, limit = 12): ChartBar[] {
  return [...group.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value, previousValue: previousGroup?.get(label) }));
}

function sumMap(group: Map<string, number>) {
  return [...group.values()].reduce((sum, value) => sum + value, 0);
}

reportsRouter.get("/jobs", asyncHandler(async (req, res) => {
  const locationId = activeLocationId(req);
  const dateRange = typeof req.query.dateRange === "string" ? req.query.dateRange : "monthToDate";
  const showBy = typeof req.query.showBy === "string" && ["day", "week", "month", "quarter", "year"].includes(req.query.showBy) ? req.query.showBy as "day" | "week" | "month" | "quarter" | "year" : "month";
  const { start, end } = rangeBounds(dateRange);
  const previousStart = addYears(start, -1);
  const previousEnd = addYears(end, -1);
  const [jobs, invoices, customers] = await Promise.all([
    prisma.job.findMany({
      where: { locationId },
      include: { customer: { include: { addresses: true } }, address: true, technician: true, lineItems: true, invoices: { include: { payments: true } } },
      orderBy: { createdAt: "desc" },
      take: 500
    }),
    prisma.invoice.findMany({
      where: { locationId, status: { not: "VOID" } },
      include: { customer: { include: { addresses: true } }, job: { include: { technician: true } }, items: true, payments: true },
      orderBy: { createdAt: "desc" },
      take: 500
    }),
    prisma.customer.findMany({ where: { locationId }, include: { addresses: true }, take: 500 })
  ]);
  const periodJobs = jobs.filter((job) => job.createdAt >= start && job.createdAt < end);
  const previousJobs = jobs.filter((job) => job.createdAt >= previousStart && job.createdAt < previousEnd);
  const periodInvoices = invoices.filter((invoice) => invoice.createdAt >= start && invoice.createdAt < end);
  const previousInvoices = invoices.filter((invoice) => invoice.createdAt >= previousStart && invoice.createdAt < previousEnd);

  const jobRevenue = new Map<string, number>();
  periodInvoices.forEach((invoice) => {
    if (invoice.jobId) addRow(jobRevenue, invoice.jobId, invoice.total);
  });

  const totalRevenue = periodInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paidInvoices = periodInvoices.filter((invoice) => invoice.status === "PAID" || invoice.payments.some((payment) => payment.status === "SUCCEEDED"));
  const paidRevenue = paidInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const completedJobs = periodJobs.filter((job) => job.status === "COMPLETED");
  const averageJob = periodJobs.length ? Math.round(totalRevenue / periodJobs.length) : 0;

  const revenueByDay = new Map<string, number>();
  const revenueByWeek = new Map<string, number>();
  const revenueByMonth = new Map<string, number>();
  const countByDay = new Map<string, number>();
  const paidByDay = new Map<string, number>();
  const paidByWeek = new Map<string, number>();
  const paidByMonth = new Map<string, number>();
  const customerNames = new Map<string, number>();
  const customerLeadSources = new Map<string, number>();
  const zipCodes = new Map<string, number>();
  const profitByType = new Map<string, number>();
  const revenueBySource = new Map<string, number>();
  const revenueByType = new Map<string, number>();
  const revenueByTag = new Map<string, number>();
  const jobTypeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const techCounts = new Map<string, number>();
  const techSales = new Map<string, number>();
  const timeByTech = new Map<string, number>();
  const materials = new Map<string, number>();
  const serviceLines = new Map<string, number>();
  const revenueByPeriod = new Map<string, number>();
  const previousRevenueByPeriod = new Map<string, number>();
  const averageByPeriod = new Map<string, number>();
  const previousSourceCounts = new Map<string, number>();
  const previousTechSales = new Map<string, number>();

  periodInvoices.forEach((invoice) => {
    addRow(revenueByDay, dateKey(invoice.createdAt, "daily"), invoice.total);
    addRow(revenueByWeek, dateKey(invoice.createdAt, "weekly"), invoice.total);
    addRow(revenueByMonth, dateKey(invoice.createdAt, "monthly"), invoice.total);
    addRow(revenueByPeriod, dateKey(invoice.createdAt, showBy), invoice.total);
    if (invoice.status === "PAID" || invoice.payments.some((payment) => payment.status === "SUCCEEDED")) {
      addRow(paidByDay, dateKey(invoice.createdAt, "daily"), invoice.total);
      addRow(paidByWeek, dateKey(invoice.createdAt, "weekly"), invoice.total);
      addRow(paidByMonth, dateKey(invoice.createdAt, "monthly"), invoice.total);
    }
    invoice.items.forEach((item) => addRow(serviceLines, item.name, Math.round(Number(item.quantity) * item.unitPrice)));
  });
  previousInvoices.forEach((invoice) => addRow(previousRevenueByPeriod, dateKey(addYears(invoice.createdAt, 1), showBy), invoice.total));

  periodJobs.forEach((job) => {
    const revenue = jobRevenue.get(job.id) ?? 0;
    const cost = job.lineItems.reduce((sum, item) => sum + Math.round(Number(item.quantity) * item.unitCost), 0);
    addRow(countByDay, dateKey(job.createdAt, "daily"), 1);
    addRow(customerNames, `${job.customer.firstName} ${job.customer.lastName}`, 1);
    addRow(customerLeadSources, job.customer.source || job.leadSource || "Unknown", 1);
    addRow(zipCodes, job.address?.postalCode || job.customer.addresses[0]?.postalCode || "Unknown", 1);
    addRow(profitByType, job.jobType, revenue - cost);
    addRow(revenueBySource, job.leadSource || "Unknown", revenue);
    addRow(revenueByType, job.jobType, revenue);
    addRow(jobTypeCounts, job.jobType, 1);
    job.tags.forEach((tag) => {
      addRow(tagCounts, tag, 1);
      addRow(revenueByTag, tag, revenue);
    });
    addRow(techCounts, job.technician?.name || "Unassigned", 1);
    addRow(techSales, job.technician?.name || "Unassigned", revenue);
    if (job.scheduledStart && job.scheduledEnd) {
      const hours = Math.max(0, job.scheduledEnd.getTime() - job.scheduledStart.getTime()) / 3600000;
      addRow(timeByTech, job.technician?.name || "Unassigned", Math.round(hours * 10) / 10);
    }
    job.lineItems.filter((item) => item.category === "material").forEach((item) => addRow(materials, item.name, Math.round(Number(item.quantity) * item.unitPrice)));
  });
  previousJobs.forEach((job) => {
    addRow(previousSourceCounts, job.customer.source || job.leadSource || "Unknown", 1);
    addRow(previousTechSales, job.technician?.name || "Unassigned", previousInvoices.filter((invoice) => invoice.jobId === job.id).reduce((sum, invoice) => sum + invoice.total, 0));
  });
  revenueByPeriod.forEach((value, label) => {
    const jobsInPeriod = periodJobs.filter((job) => dateKey(job.createdAt, showBy) === label).length || 1;
    averageByPeriod.set(label, Math.round(value / jobsInPeriod));
  });

  const sections: Array<{ title: string; items: ReportItem[] }> = [
    {
      title: "Date",
      items: [
        { id: "job-revenue-earned", label: "Job revenue earned", value: cents(totalRevenue), detail: "Revenue from non-void invoices.", rows: moneyRows(revenueByDay) },
        { id: "average-job-size", label: "Average job size", value: cents(averageJob), detail: "Invoice revenue divided by job count.", rows: [{ label: "Average", value: cents(averageJob) }, { label: "Jobs", value: String(periodJobs.length) }] },
        { id: "job-count", label: "Job count", value: String(periodJobs.length), detail: "Total jobs created.", rows: countRows(countByDay) },
        { id: "daily", label: "Daily", value: cents(totalRevenue), detail: "Revenue grouped by day.", rows: moneyRows(revenueByDay) },
        { id: "weekly", label: "Weekly", value: cents(totalRevenue), detail: "Revenue grouped by week.", rows: moneyRows(revenueByWeek) },
        { id: "monthly", label: "Monthly", value: cents(totalRevenue), detail: "Revenue grouped by month.", rows: moneyRows(revenueByMonth) }
      ]
    },
    {
      title: "Paid in full jobs",
      items: [
        { id: "paid-daily", label: "Daily (by paid in full date)", value: cents(paidRevenue), detail: "Paid invoice totals grouped by day.", rows: moneyRows(paidByDay) },
        { id: "paid-weekly", label: "Weekly (by paid in full date)", value: cents(paidRevenue), detail: "Paid invoice totals grouped by week.", rows: moneyRows(paidByWeek) },
        { id: "paid-monthly", label: "Monthly (by paid in full date)", value: cents(paidRevenue), detail: "Paid invoice totals grouped by month.", rows: moneyRows(paidByMonth) }
      ]
    },
    {
      title: "Customer",
      items: [
        { id: "customer-name", label: "Customer name", value: String(customers.length), detail: "Jobs grouped by customer.", rows: countRows(customerNames) },
        { id: "customer-lead-source", label: "Customer lead source", value: String(customerLeadSources.size), detail: "Customers and jobs grouped by source.", rows: countRows(customerLeadSources) },
        { id: "rating-reviews", label: "Rating and reviews", value: "Coming soon", detail: "Review integration will fill this report once connected.", rows: [{ label: "Review integration", value: "Not connected" }] },
        { id: "zip-code", label: "Zip code", value: String(zipCodes.size), detail: "Jobs grouped by postal code.", rows: countRows(zipCodes) }
      ]
    },
    {
      title: "Type",
      items: [
        { id: "job-tags", label: "Job tags", value: String(tagCounts.size), detail: "Jobs grouped by tag.", rows: countRows(tagCounts) },
        { id: "job-lead-source", label: "Job lead source", value: String(revenueBySource.size), detail: "Revenue grouped by job lead source.", rows: moneyRows(revenueBySource) },
        { id: "business-unit", label: "Business unit", value: "Locksmith", detail: "Business unit reporting placeholder.", rows: [{ label: "Locksmith", value: cents(totalRevenue) }] },
        { id: "job-type", label: "Job type", value: String(revenueByType.size), detail: "Revenue grouped by job type.", rows: moneyRows(revenueByType) }
      ]
    },
    {
      title: "Job costing",
      items: [
        { id: "profit-by-date", label: "Profit by date", value: cents(totalRevenue), detail: "Revenue less entered line-item costs.", rows: moneyRows(revenueByDay) },
        { id: "profit-by-business-unit", label: "Profit by business unit", value: cents(totalRevenue), detail: "Profit grouped by business unit.", rows: [{ label: "Locksmith", value: cents(totalRevenue) }] },
        { id: "profit-by-job-type", label: "Profit by job type", value: cents([...profitByType.values()].reduce((sum, value) => sum + value, 0)), detail: "Profit grouped by job type.", rows: moneyRows(profitByType) },
        { id: "expected-costs-by-date", label: "Expected costs by date", value: cents(periodJobs.reduce((sum, job) => sum + job.lineItems.reduce((itemSum, item) => itemSum + Math.round(Number(item.quantity) * item.unitCost), 0), 0)), detail: "Expected costs from job line items.", rows: periodJobs.map((job) => ({ label: `#${job.jobNumber} ${job.title}`, value: cents(job.lineItems.reduce((sum, item) => sum + Math.round(Number(item.quantity) * item.unitCost), 0)) })).slice(0, 20) }
      ]
    },
    {
      title: "Employee",
      items: [
        { id: "tech-leaderboard", label: "Tech leaderboard", value: String(techCounts.size), detail: "Job count by technician.", rows: countRows(techCounts) },
        { id: "on-job-sales-by-employee", label: "On job sales by employee", value: cents(totalRevenue), detail: "Invoice revenue grouped by assigned technician.", rows: moneyRows(techSales) },
        { id: "commissions", label: "Commissions", value: cents(Math.round(totalRevenue * 0.1)), detail: "Estimated commissions at 10% of invoice revenue.", rows: moneyRows(new Map([...techSales.entries()].map(([key, value]) => [key, Math.round(value * 0.1)]))) },
        { id: "estimates-on-jobs", label: "Estimates on jobs", value: "0", detail: "Estimate module report placeholder.", rows: [{ label: "Estimates", value: "Not connected yet" }] }
      ]
    },
    {
      title: "Time tracking",
      items: [
        { id: "job-time-tracking-by-employee", label: "Job time tracking by employee", value: `${[...timeByTech.values()].reduce((sum, value) => sum + value, 0)} hrs`, detail: "Scheduled job time grouped by technician.", rows: [...timeByTech.entries()].map(([label, value]) => ({ label, value: `${value} hrs` })) },
        { id: "overall-job-time-tracking", label: "Overall job time tracking", value: `${[...timeByTech.values()].reduce((sum, value) => sum + value, 0)} hrs`, detail: "Total scheduled job hours.", rows: [{ label: "Total scheduled hours", value: `${[...timeByTech.values()].reduce((sum, value) => sum + value, 0)} hrs` }] }
      ]
    },
    {
      title: "Line items",
      items: [
        { id: "material-on-jobs", label: "Material on jobs", value: cents([...materials.values()].reduce((sum, value) => sum + value, 0)), detail: "Material line items used on jobs.", rows: moneyRows(materials) },
        { id: "discounts-on-jobs", label: "Discounts on jobs", value: cents(0), detail: "Discount report placeholder.", rows: [{ label: "Discounts", value: cents(0) }] },
        { id: "standard-discounts-on-jobs", label: "Standard discounts on jobs", value: cents(0), detail: "Standard discount tracking placeholder.", rows: [{ label: "Standard discounts", value: cents(0) }] },
        { id: "recurring-discounts-on-jobs", label: "Recurring discounts on jobs", value: cents(0), detail: "Recurring discount tracking placeholder.", rows: [{ label: "Recurring discounts", value: cents(0) }] },
        { id: "service-line-items-on-jobs", label: "Service line items on jobs", value: cents([...serviceLines.values()].reduce((sum, value) => sum + value, 0)), detail: "Invoice service lines grouped by item.", rows: moneyRows(serviceLines) }
      ]
    }
  ];

  res.json({
    overview: {
      jobs: periodJobs.length,
      completedJobs: completedJobs.length,
      invoices: periodInvoices.length,
      revenue: cents(totalRevenue),
      paidRevenue: cents(paidRevenue),
      paidRate: periodInvoices.length ? percent(paidInvoices.length / periodInvoices.length) : percent(0)
    },
    dashboards: {
      businessOwner: [
        { id: "job-revenue", title: "Job revenue", metricLabel: "Job revenue total", metricValue: cents(totalRevenue), format: "money", bars: chartRows(revenueByPeriod, previousRevenueByPeriod) },
        { id: "job-tags", title: "Job tags", metricLabel: "Job revenue total", metricValue: cents(revenueByTag.size ? sumMap(revenueByTag) : sumMap(revenueByType)), format: "money", bars: chartRows(revenueByTag.size ? revenueByTag : revenueByType) },
        { id: "average-job-size", title: "Average job size", metricLabel: "Avg job size total", metricValue: cents(averageJob), format: "money", bars: chartRows(averageByPeriod) },
        { id: "tech-leaderboard", title: "Tech leaderboard", metricLabel: "Job revenue total", metricValue: cents(sumMap(techSales)), format: "money", bars: chartRows(techSales, previousTechSales) },
        { id: "commissions", title: "Commissions", metricLabel: "Commission cost total", metricValue: cents(Math.round(sumMap(techSales) * 0.1)), format: "money", bars: chartRows(new Map([...techSales.entries()].map(([key, value]) => [key, Math.round(value * 0.1)]))) }
      ],
      leads: [
        { id: "leads-by-source", title: "Leads by source", metricLabel: "Lead count total", metricValue: String(sumMap(customerLeadSources)), format: "number", bars: chartRows(customerLeadSources, previousSourceCounts) },
        { id: "revenue-by-lead-source", title: "Revenue by lead source", metricLabel: "Job revenue total", metricValue: cents(sumMap(revenueBySource)), format: "money", bars: chartRows(revenueBySource) },
        { id: "booking-by-job-type", title: "Bookings by job type", metricLabel: "Job count total", metricValue: String(periodJobs.length), format: "number", bars: chartRows(jobTypeCounts) }
      ]
    },
    sections
  });
}));
