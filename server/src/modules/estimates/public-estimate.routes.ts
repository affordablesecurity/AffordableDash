import { EstimateStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendEmail } from "../messaging/email.service.js";

export const publicEstimateRouter = Router();

const approvalSchema = z.object({
  approvalName: z.string().trim().min(1).max(120),
  approvalSignature: z.string().trim().min(100, "Signature is required").max(500_000)
});

function cents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function estimateNumberFromParam(value: string) {
  const estimateNumber = Number(value);
  return Number.isInteger(estimateNumber) && estimateNumber > 0 ? estimateNumber : null;
}

async function loadEstimate(estimateNumber: number) {
  return prisma.estimate.findUnique({
    where: { estimateNumber },
    include: {
      customer: { include: { addresses: true } },
      address: true,
      lineItems: true,
      location: { include: { organization: true } }
    }
  });
}

function companyName(estimate: NonNullable<Awaited<ReturnType<typeof loadEstimate>>>) {
  const candidates = [
    estimate.location.organization?.name,
    estimate.location.displayName,
    estimate.location.name
  ].filter(Boolean) as string[];
  const nonBranchName = candidates.find((name) => !["yuma", "phoenix", "tucson"].includes(name.trim().toLowerCase()));
  return nonBranchName || "Affordable Security Locksmith And Alarm L.L.C.";
}

function subtotal(estimate: NonNullable<Awaited<ReturnType<typeof loadEstimate>>>) {
  return estimate.lineItems.reduce((sum, item) => sum + Math.round(Number(item.quantity || 0) * item.unitPrice), 0);
}

function tax(estimate: NonNullable<Awaited<ReturnType<typeof loadEstimate>>>) {
  const taxable = estimate.lineItems.reduce((sum, item) => item.category === "material" && item.taxable !== false
    ? sum + Math.round(Number(item.quantity || 0) * item.unitPrice)
    : sum, 0);
  return Math.round(taxable * 0.094);
}

function depositDue(estimate: NonNullable<Awaited<ReturnType<typeof loadEstimate>>>, total: number) {
  if (estimate.depositType === "PERCENT") return Math.round(total * ((estimate.depositPercent ?? 50) / 100));
  if (estimate.depositType === "FIXED") return Math.min(estimate.depositAmount ?? 0, total);
  return 0;
}

async function queueEstimateApprovedNotifications(estimate: NonNullable<Awaited<ReturnType<typeof loadEstimate>>>) {
  const business = companyName(estimate);
  const customerName = [estimate.customer.firstName, estimate.customer.lastName].filter(Boolean).join(" ") || estimate.customer.companyName || "Customer";
  const estimateUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/estimate/${estimate.estimateNumber}`;
  const recipients = await prisma.userMembership.findMany({
    where: {
      organizationId: estimate.location.organizationId,
      role: { in: ["OWNER", "ADMIN"] },
      OR: [{ locationId: null }, { locationId: estimate.locationId }]
    },
    include: { user: true }
  });
  const uniqueEmails = [...new Set(recipients.map((membership) => membership.user.email).filter(Boolean))];
  await Promise.all(uniqueEmails.map((email) => sendEmail({
    locationId: estimate.locationId,
    customerId: estimate.customerId,
    to: email,
    subject: `Estimate #${estimate.estimateNumber} approved by ${customerName}`,
    body: `Estimate #${estimate.estimateNumber} from ${customerName} was approved.\n\nView the signed estimate: ${estimateUrl}`,
    templateKey: "estimateApprovedInternal"
  })));
  await prisma.customerNote.create({
    data: {
      customerId: estimate.customerId,
      author: "System",
      content: `Estimate #${estimate.estimateNumber} approved by ${customerName}. Signed estimate: ${estimateUrl}`
    }
  });
}

function renderEstimatePage(estimate: NonNullable<Awaited<ReturnType<typeof loadEstimate>>>) {
  const business = companyName(estimate);
  const customerName = [estimate.customer.firstName, estimate.customer.lastName].filter(Boolean).join(" ") || estimate.customer.companyName || "Customer";
  const address = estimate.address || estimate.customer.addresses[0];
  const estimateSubtotal = subtotal(estimate);
  const estimateTax = tax(estimate);
  const estimateTotal = estimateSubtotal + estimateTax;
  const deposit = depositDue(estimate, estimateTotal);
  const statusText = estimate.status === "APPROVED" ? "Approved" : estimate.status === "DECLINED" ? "Declined" : "Ready for review";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Estimate #${escapeHtml(estimate.estimateNumber)} | ${escapeHtml(business)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #232735; }
    .shell { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 52px; }
    .brand { text-align: center; margin-bottom: 22px; }
    .brand-mark { display: inline-block; background: #3499f4; color: #071429; padding: 10px 22px; font-weight: 900; font-size: 28px; line-height: .95; }
    .brand-mark span { display: block; color: #fff; margin-left: 42px; }
    h1 { text-align: center; font-size: clamp(24px, 4vw, 34px); line-height: 1.2; margin: 10px 0 4px; }
    .amount-due { text-align: center; font-size: 19px; font-weight: 800; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid #e3e6eb; border-radius: 8px; box-shadow: 0 8px 26px rgba(25,32,46,.08); margin-bottom: 18px; overflow: hidden; }
    .card h2 { font-size: 20px; margin: 0; padding: 16px 20px; border-bottom: 1px solid #e6e8ed; }
    .card-body { padding: 20px; }
    .status { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: #f0efff; color: #3733ff; font-weight: 800; }
    .actions { display: grid; gap: 14px; }
    .approve-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; }
    input { border: 1px solid #d2d7df; border-radius: 8px; padding: 12px; font: inherit; }
    .signature-pad { width: 100%; height: 190px; border: 1px solid #d2d7df; border-radius: 8px; background: #fff; touch-action: none; display: block; cursor: crosshair; }
    .signature-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    button { border: 0; border-radius: 999px; padding: 13px 18px; font-weight: 800; cursor: pointer; }
    .primary { background: #3f3df2; color: #fff; }
    .danger { background: #fff; color: #b42318; border: 1px solid #f3b8b0; }
    .muted { color: #697386; font-size: 13px; line-height: 1.45; }
    .message { font-weight: 800; }
    .paper { background: #fff; border: 1px solid #dcdfe5; padding: 28px; }
    .head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #dcdfe5; padding-bottom: 18px; }
    .meta { border: 1px solid #bfc5cf; min-width: 260px; }
    .meta div { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
    .meta div:last-child { border-bottom: 0; font-weight: 900; font-size: 18px; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 28px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #767b86; color: #fff; text-align: left; padding: 9px; font-weight: 700; }
    td { border-bottom: 1px solid #e5e7eb; padding: 10px 9px; vertical-align: top; }
    td:last-child, th:last-child { text-align: right; }
    .totals { margin-left: auto; width: min(340px, 100%); display: grid; grid-template-columns: 1fr auto; gap: 8px 18px; padding-top: 18px; }
    .totals strong { font-size: 20px; }
    @media (max-width: 760px) { .approve-grid, .party-grid, .head { grid-template-columns: 1fr; display: grid; } }
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand"><div class="brand-mark">Affordable<span>Security</span></div></div>
    <h1>Review your estimate from ${escapeHtml(business)}</h1>
    <div class="amount-due">${escapeHtml(cents(estimateTotal))} estimate${deposit > 0 ? ` / ${escapeHtml(cents(deposit))} deposit` : ""}</div>

    <section class="card">
      <h2>Estimate status</h2>
      <div class="card-body actions">
        <span class="status">${escapeHtml(statusText)}</span>
        ${estimate.status === "APPROVED" ? `<p class="message">Approved by ${escapeHtml(estimate.approvalName || customerName)}.</p>` : estimate.status === "DECLINED" ? `<p class="message">This estimate has been declined.</p>` : `
          <div class="approve-grid">
            <input id="approval-name" placeholder="Your name" value="${escapeHtml(customerName)}" />
            <button class="primary" id="approve-button" type="button" disabled>Approve</button>
            <button class="danger" id="decline-button" type="button">Decline</button>
          </div>
          <div>
            <p class="muted">Sign below before approving this estimate.</p>
            <canvas class="signature-pad" id="signature-pad" width="900" height="260"></canvas>
            <div class="signature-actions"><span class="muted">Use your finger, stylus, or mouse.</span><button type="button" id="clear-signature">Clear signature</button></div>
          </div>
          ${deposit > 0 ? `<p class="muted">Approval requires a ${escapeHtml(cents(deposit))} deposit. The payment link can be sent after approval.</p>` : ""}
          <p id="action-message" class="message" role="alert"></p>
        `}
      </div>
    </section>

    <section class="card">
      <h2>Estimate Summary</h2>
      <div class="paper">
        <div class="head">
          <div><strong>${escapeHtml(business)}</strong><br /><span class="muted">${escapeHtml([estimate.location.street1, estimate.location.city, estimate.location.state, estimate.location.postalCode].filter(Boolean).join(", "))}</span></div>
          <div class="meta">
            <div><span>ESTIMATE</span><b>#${escapeHtml(estimate.estimateNumber)}</b></div>
            <div><span>DATE</span><b>${escapeHtml(estimate.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: estimate.location.timezone || "America/Phoenix" }))}</b></div>
            <div><span>STATUS</span><b>${escapeHtml(estimate.status)}</b></div>
            <div><span>TOTAL</span><strong>${escapeHtml(cents(estimateTotal))}</strong></div>
          </div>
        </div>
        <div class="party-grid">
          <div><strong>${escapeHtml(customerName)}</strong><br />${escapeHtml([address?.street1, address?.street2, address?.city, address?.state, address?.postalCode].filter(Boolean).join(", "))}<br />${escapeHtml(estimate.customer.phone)}</div>
          <div><strong>Contact us</strong><br />${escapeHtml(estimate.location.phone || "(928) 580-2775")}<br />service@5802775.com</div>
        </div>
        <table>
          <thead><tr><th>Services</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
          <tbody>${estimate.lineItems.map((item) => {
            const quantity = Number(item.quantity || 1);
            const amount = Math.round(quantity * item.unitPrice);
            return `<tr><td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<br /><span class="muted">${escapeHtml(item.description)}</span>` : ""}</td><td>${escapeHtml(quantity)}</td><td>${escapeHtml(cents(item.unitPrice))}</td><td>${escapeHtml(cents(amount))}</td></tr>`;
          }).join("")}</tbody>
        </table>
        <div class="totals"><span>Subtotal</span><b>${escapeHtml(cents(estimateSubtotal))}</b><span>Tax</span><b>${escapeHtml(cents(estimateTax))}</b>${deposit > 0 ? `<span>Deposit due</span><b>${escapeHtml(cents(deposit))}</b>` : ""}<strong>Total</strong><strong>${escapeHtml(cents(estimateTotal))}</strong></div>
      </div>
    </section>
  </main>
  ${estimate.status === "SENT" || estimate.status === "DRAFT" ? `<script>
    const message = document.getElementById("action-message");
    const approveButton = document.getElementById("approve-button");
    const declineButton = document.getElementById("decline-button");
    const signaturePad = document.getElementById("signature-pad");
    const clearSignature = document.getElementById("clear-signature");
    const signatureContext = signaturePad?.getContext("2d");
    let signing = false;
    let hasSignature = false;
    let lastPoint = null;
    function setApproveState() {
      if (approveButton) approveButton.disabled = !hasSignature;
    }
    function resizeSignaturePad() {
      if (!signaturePad || !signatureContext) return;
      const rect = signaturePad.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      signaturePad.width = Math.max(1, Math.round(rect.width * scale));
      signaturePad.height = Math.max(1, Math.round(rect.height * scale));
      signatureContext.setTransform(scale, 0, 0, scale, 0, 0);
      signatureContext.lineWidth = 4;
      signatureContext.lineCap = "round";
      signatureContext.lineJoin = "round";
      signatureContext.strokeStyle = "#101421";
    }
    function signaturePoint(event) {
      const rect = signaturePad.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }
    function startSignature(event) {
      event.preventDefault();
      if (!signaturePad || !signatureContext) return;
      signing = true;
      signaturePad.setPointerCapture?.(event.pointerId);
      lastPoint = signaturePoint(event);
      signatureContext.beginPath();
      signatureContext.moveTo(lastPoint.x, lastPoint.y);
    }
    function moveSignature(event) {
      if (!signing || !lastPoint || !signatureContext) return;
      event.preventDefault();
      const point = signaturePoint(event);
      signatureContext.beginPath();
      signatureContext.moveTo(lastPoint.x, lastPoint.y);
      signatureContext.lineTo(point.x, point.y);
      signatureContext.stroke();
      lastPoint = point;
      hasSignature = true;
      setApproveState();
    }
    function endSignature(event) {
      signing = false;
      lastPoint = null;
      try {
        signaturePad?.releasePointerCapture?.(event.pointerId);
      } catch {}
    }
    async function submitAction(action) {
      const approvalName = document.getElementById("approval-name").value.trim();
      if (action === "approve" && !hasSignature) {
        message.textContent = "Please sign the estimate before approving.";
        return;
      }
      const response = await fetch("/estimate/${estimate.estimateNumber}/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalName, approvalSignature: action === "approve" ? signaturePad.toDataURL("image/png") : undefined })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        message.textContent = body.error || "Unable to update estimate.";
        return;
      }
      window.location.reload();
    }
    resizeSignaturePad();
    window.addEventListener("resize", resizeSignaturePad);
    signaturePad?.addEventListener("pointerdown", startSignature);
    signaturePad?.addEventListener("pointermove", moveSignature);
    signaturePad?.addEventListener("pointerup", endSignature);
    signaturePad?.addEventListener("pointercancel", endSignature);
    signaturePad?.addEventListener("pointerleave", endSignature);
    clearSignature?.addEventListener("click", () => {
      signatureContext.clearRect(0, 0, signaturePad.width, signaturePad.height);
      hasSignature = false;
      setApproveState();
      message.textContent = "";
    });
    approveButton?.addEventListener("click", () => submitAction("approve"));
    declineButton?.addEventListener("click", () => submitAction("decline"));
  </script>` : ""}
</body>
</html>`;
}

publicEstimateRouter.get("/:estimateNumber", asyncHandler(async (req, res) => {
  const estimateNumber = estimateNumberFromParam(String(req.params.estimateNumber));
  if (!estimateNumber) return res.status(404).send("Estimate not found");
  const estimate = await loadEstimate(estimateNumber);
  if (!estimate) return res.status(404).send("Estimate not found");
  res.status(200).send(renderEstimatePage(estimate));
}));

publicEstimateRouter.post("/:estimateNumber/approve", asyncHandler(async (req, res) => {
  const estimateNumber = estimateNumberFromParam(String(req.params.estimateNumber));
  if (!estimateNumber) return res.status(404).json({ error: "Estimate not found" });
  const input = approvalSchema.parse(req.body);
  const estimate = await loadEstimate(estimateNumber);
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status === EstimateStatus.DECLINED) return res.status(409).json({ error: "This estimate was already declined." });
  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      status: EstimateStatus.APPROVED,
      approvalName: input.approvalName,
      approvalSignature: input.approvalSignature,
      approvedAt: new Date()
    }
  });
  await queueEstimateApprovedNotifications(estimate);
  res.json({ estimate: updated });
}));

publicEstimateRouter.post("/:estimateNumber/decline", asyncHandler(async (req, res) => {
  const estimateNumber = estimateNumberFromParam(String(req.params.estimateNumber));
  if (!estimateNumber) return res.status(404).json({ error: "Estimate not found" });
  const estimate = await loadEstimate(estimateNumber);
  if (!estimate) return res.status(404).json({ error: "Estimate not found" });
  if (estimate.status === EstimateStatus.APPROVED) return res.status(409).json({ error: "This estimate was already approved." });
  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      status: EstimateStatus.DECLINED,
      declinedAt: new Date()
    }
  });
  res.json({ estimate: updated });
}));
