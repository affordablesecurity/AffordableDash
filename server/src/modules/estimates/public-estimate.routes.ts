import { EstimateStatus } from "@prisma/client";
import { Router, type Request } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendEmail } from "../messaging/email.service.js";

export const publicEstimateRouter = Router();

const approvalSchema = z.object({
  approvalName: z.string().trim().min(1).max(120),
  optionId: z.string().optional(),
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

function requestIp(req: Request) {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || req.socket.remoteAddress || null;
}

async function loadEstimate(estimateNumber: number) {
  return prisma.estimate.findUnique({
    where: { estimateNumber },
    include: {
      customer: { include: { addresses: true } },
      address: true,
      lineItems: true,
      options: { include: { lineItems: true }, orderBy: { sortOrder: "asc" } },
      approvedOption: true,
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

function subtotal(input: { lineItems: Array<{ quantity: unknown; unitPrice: number }> }) {
  return input.lineItems.reduce((sum, item) => sum + Math.round(Number(item.quantity || 0) * item.unitPrice), 0);
}

function tax(input: { lineItems: Array<{ category: string; taxable: boolean; quantity: unknown; unitPrice: number }> }) {
  const taxable = input.lineItems.reduce((sum, item) => item.category === "material" && item.taxable !== false
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
  const statusText = estimate.status === "APPROVED" ? "Approved" : estimate.status === "DECLINED" ? "Declined" : "Ready for review";
  const optionCards = estimate.options.length ? estimate.options : [{
    id: "",
    title: estimate.title,
    description: estimate.description,
    lineItems: estimate.lineItems
  }];
  const firstOptionSubtotal = subtotal(optionCards[0]);
  const firstOptionTax = tax(optionCards[0]);
  const firstOptionTotal = firstOptionSubtotal + firstOptionTax;
  const firstOptionDeposit = depositDue(estimate, firstOptionTotal);

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
    .option-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .option-card { border: 1px solid #dcdfe5; border-radius: 8px; padding: 18px; display: grid; gap: 12px; }
    .option-card.selected { border-color: #3f3df2; box-shadow: 0 0 0 2px rgba(63,61,242,.15); }
    .option-card h3 { margin: 0; }
    .option-total { font-size: 20px; font-weight: 900; }
    .option-summary { display: none; }
    .option-summary.selected { display: block; }
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
    <div class="amount-due" id="selected-total">${escapeHtml(cents(firstOptionTotal))} estimate${firstOptionDeposit > 0 ? ` / ${escapeHtml(cents(firstOptionDeposit))} deposit` : ""}</div>

    <section class="card">
      <h2>Choose an option</h2>
      <div class="card-body option-grid">
        ${optionCards.map((option, index) => {
          const optionSubtotal = subtotal(option);
          const optionTax = tax(option);
          const optionTotal = optionSubtotal + optionTax;
          const optionDeposit = depositDue(estimate, optionTotal);
          return `<button class="option-card ${index === 0 ? "selected" : ""}" type="button" data-option-id="${escapeHtml(option.id)}" data-total-label="${escapeHtml(`${cents(optionTotal)} estimate${optionDeposit > 0 ? ` / ${cents(optionDeposit)} deposit` : ""}`)}" data-deposit-note="${escapeHtml(optionDeposit > 0 ? `Approval requires a ${cents(optionDeposit)} deposit. The payment link can be sent after approval.` : "")}">
            <h3>${escapeHtml(option.title || `Option #${index + 1}`)}</h3>
            <p class="muted">${escapeHtml(option.description || "Review this option and approve it below.")}</p>
            <span class="option-total">${escapeHtml(cents(optionTotal))}</span>
            <span class="muted">${escapeHtml(option.lineItems.length)} line item${option.lineItems.length === 1 ? "" : "s"}</span>
          </button>`;
        }).join("")}
      </div>
    </section>

    <section class="card">
      <h2>Estimate Summary</h2>
      ${optionCards.map((option, index) => {
        const optionSubtotal = subtotal(option);
        const optionTax = tax(option);
        const optionTotal = optionSubtotal + optionTax;
        const optionDeposit = depositDue(estimate, optionTotal);
        return `<div class="paper option-summary ${index === 0 ? "selected" : ""}" data-option-id="${escapeHtml(option.id)}">
          <div class="head">
            <div><strong>${escapeHtml(business)}</strong><br /><span class="muted">${escapeHtml([estimate.location.street1, estimate.location.city, estimate.location.state, estimate.location.postalCode].filter(Boolean).join(", "))}</span></div>
            <div class="meta">
              <div><span>ESTIMATE</span><b>#${escapeHtml(estimate.estimateNumber)}</b></div>
              <div><span>OPTION</span><b>${escapeHtml(option.title || `Option #${index + 1}`)}</b></div>
              <div><span>DATE</span><b>${escapeHtml(estimate.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: estimate.location.timezone || "America/Phoenix" }))}</b></div>
              <div><span>TOTAL</span><strong>${escapeHtml(cents(optionTotal))}</strong></div>
            </div>
          </div>
          <div class="party-grid">
            <div><strong>${escapeHtml(customerName)}</strong><br />${escapeHtml([address?.street1, address?.street2, address?.city, address?.state, address?.postalCode].filter(Boolean).join(", "))}<br />${escapeHtml(estimate.customer.phone)}</div>
            <div><strong>Contact us</strong><br />${escapeHtml(estimate.location.phone || "(928) 580-2775")}<br />service@5802775.com</div>
          </div>
          <table>
            <thead><tr><th>Services</th><th>Qty</th><th>Amount</th></tr></thead>
            <tbody>${option.lineItems.map((item) => {
              const quantity = Number(item.quantity || 1);
              const amount = Math.round(quantity * item.unitPrice);
              return `<tr><td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<br /><span class="muted">${escapeHtml(item.description)}</span>` : ""}</td><td>${escapeHtml(quantity)}</td><td>${escapeHtml(cents(amount))}</td></tr>`;
            }).join("") || `<tr><td colspan="3" class="muted">No line items on this option yet.</td></tr>`}</tbody>
          </table>
          <div class="totals"><span>Subtotal</span><b>${escapeHtml(cents(optionSubtotal))}</b><span>Tax</span><b>${escapeHtml(cents(optionTax))}</b>${optionDeposit > 0 ? `<span>Deposit due</span><b>${escapeHtml(cents(optionDeposit))}</b>` : ""}<strong>Total</strong><strong>${escapeHtml(cents(optionTotal))}</strong></div>
        </div>`;
      }).join("")}
    </section>

    <section class="card">
      <h2>Estimate status</h2>
      <div class="card-body actions">
        <span class="status">${escapeHtml(statusText)}</span>
        ${estimate.status === "APPROVED" ? `<p class="message">Approved by ${escapeHtml(estimate.approvalName || customerName)}.</p>` : estimate.status === "DECLINED" ? `<p class="message">This estimate has been declined.</p>` : `
          <div class="approve-grid">
            <input id="approval-name" placeholder="Your name" value="${escapeHtml(customerName)}" />
            <button class="primary" id="approve-button" type="button" disabled>Approve selected option</button>
            <button class="danger" id="decline-button" type="button">Decline</button>
          </div>
          <div>
            <p class="muted">Sign below before approving the selected option.</p>
            <canvas class="signature-pad" id="signature-pad" width="900" height="260"></canvas>
            <div class="signature-actions"><span class="muted">Use your finger, stylus, or mouse.</span><button type="button" id="clear-signature">Clear signature</button></div>
          </div>
          <p class="muted" id="deposit-note">${firstOptionDeposit > 0 ? `Approval requires a ${escapeHtml(cents(firstOptionDeposit))} deposit. The payment link can be sent after approval.` : ""}</p>
          <p id="action-message" class="message" role="alert"></p>
        `}
      </div>
    </section>
  </main>
  <script>
    const message = document.getElementById("action-message");
    const approveButton = document.getElementById("approve-button");
    const declineButton = document.getElementById("decline-button");
    const optionButtons = Array.from(document.querySelectorAll(".option-card"));
    const optionSummaries = Array.from(document.querySelectorAll(".option-summary"));
    const selectedTotal = document.getElementById("selected-total");
    const depositNote = document.getElementById("deposit-note");
    let selectedOptionId = optionButtons[0]?.dataset.optionId || "";
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
        body: JSON.stringify({ approvalName, optionId: selectedOptionId || undefined, approvalSignature: action === "approve" ? signaturePad.toDataURL("image/png") : undefined })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        message.textContent = body.error || "Unable to update estimate.";
        return;
      }
      window.location.reload();
    }
    optionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        optionButtons.forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        selectedOptionId = button.dataset.optionId || "";
        optionSummaries.forEach((summary) => {
          summary.classList.toggle("selected", (summary.dataset.optionId || "") === selectedOptionId);
        });
        if (selectedTotal && button.dataset.totalLabel) selectedTotal.textContent = button.dataset.totalLabel;
        if (depositNote) depositNote.textContent = button.dataset.depositNote || "";
      });
    });
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
  </script>
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
      approvedOptionId: input.optionId,
      approvalSignature: input.approvalSignature,
      approvalIpAddress: requestIp(req),
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
