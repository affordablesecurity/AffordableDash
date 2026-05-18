import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { sendPaymentReceiptSms } from "../messaging/messaging.service.js";
import { createInvoiceCheckoutSession, createInvoicePaymentIntent, getLocationStripeConfig } from "./stripe.service.js";

export const publicPayRouter = Router();

const tipSchema = z.object({
  tipAmount: z.number().int().min(0).max(100_000).default(0)
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

function invoiceNumberFromParam(value: string) {
  const invoiceNumber = Number(value);
  return Number.isInteger(invoiceNumber) && invoiceNumber > 0 ? invoiceNumber : null;
}

function queryValue(value: unknown) {
  if (Array.isArray(value)) return queryValue(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

async function loadInvoice(invoiceNumber: number) {
  return prisma.invoice.findUnique({
    where: { invoiceNumber },
    include: {
      customer: { include: { addresses: true } },
      job: { include: { address: true, technician: true } },
      items: true,
      location: { include: { organization: true } }
    }
  });
}

async function recordPaidStripeInvoice(input: {
  invoice: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;
  paymentId: string;
  providerRef: string;
  amount: number;
}) {
  const { invoice, paymentId, providerRef, amount } = input;
  if (amount <= 0) return false;
  const existingInvoice = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    select: { status: true, total: true }
  });
  await prisma.payment.upsert({
    where: { id: paymentId },
    update: {
      status: "SUCCEEDED",
      amount,
      provider: "stripe",
      providerRef,
      paidAt: new Date()
    },
    create: {
      id: paymentId,
      invoiceId: invoice.id,
      amount,
      status: "SUCCEEDED",
      provider: "stripe",
      providerRef,
      paidAt: new Date()
    }
  });
  const paidTotal = await prisma.payment.aggregate({
    where: { invoiceId: invoice.id, status: "SUCCEEDED" },
    _sum: { amount: true }
  });
  const isPaidInFull = (paidTotal._sum.amount ?? 0) >= (existingInvoice?.total ?? invoice.total);
  if (isPaidInFull) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID" }
    });
    if (existingInvoice?.status !== "PAID") {
      await sendPaymentReceiptSms(invoice.locationId, invoice.id, amount);
    }
  }
  return isPaidInFull;
}

async function reconcileStripeReturn(invoice: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>, query: Record<string, unknown>) {
  const config = await getLocationStripeConfig(invoice.locationId);
  if (!config.stripe) return false;

  const sessionId = queryValue(query.session_id);
  if (sessionId) {
    const session = await config.stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["payment_intent"] },
      config.accountId ? { stripeAccount: config.accountId } : undefined
    );
    if (session.payment_status !== "paid" || session.metadata?.invoiceId !== invoice.id) return false;
    const paymentIntent = typeof session.payment_intent === "string" ? null : session.payment_intent;
    const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : paymentIntent?.id ?? session.id;
    const amount = session.amount_total ?? paymentIntent?.amount_received ?? paymentIntent?.amount ?? 0;
    return recordPaidStripeInvoice({ invoice, paymentId, providerRef: session.id, amount });
  }

  const paymentIntentId = queryValue(query.payment_intent);
  if (paymentIntentId) {
    const intent = await config.stripe.paymentIntents.retrieve(
      paymentIntentId,
      {},
      config.accountId ? { stripeAccount: config.accountId } : undefined
    );
    const matchesInvoice = intent.metadata.invoiceId === invoice.id || invoice.stripePaymentIntentId === intent.id;
    if (!matchesInvoice || intent.status !== "succeeded") return false;
    return recordPaidStripeInvoice({
      invoice,
      paymentId: intent.id,
      providerRef: intent.id,
      amount: intent.amount_received || intent.amount
    });
  }

  return false;
}

function publicCompanyName(invoice: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>) {
  const candidates = [
    invoice.location.organization?.name,
    invoice.location.displayName,
    invoice.location.name
  ].filter(Boolean) as string[];
  const nonBranchName = candidates.find((name) => !["yuma", "phoenix", "tucson"].includes(name.trim().toLowerCase()));
  return nonBranchName || "Affordable Security Locksmith And Alarm L.L.C.";
}

function invoiceLines(invoice: Awaited<ReturnType<typeof loadInvoice>> extends infer T ? NonNullable<T> : never) {
  return invoice.items.length
    ? invoice.items
    : [{
      id: "invoice-total",
      name: invoice.job?.title || invoice.job?.jobType || "Locksmith service",
      description: invoice.job?.jobNumber ? `Job #${invoice.job.jobNumber}` : "",
      quantity: 1,
      unitPrice: invoice.total,
      taxable: false,
      invoiceId: invoice.id,
      category: "service",
      createdAt: invoice.createdAt
    }];
}

function renderInvoicePayPage(input: {
  invoice: NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;
  clientSecret?: string | null;
  stripeAccount?: string | null;
  publishableKey?: string | null;
  checkoutUrl?: string | null;
  configurationError?: string | null;
}) {
  const { invoice, clientSecret, stripeAccount, checkoutUrl, configurationError } = input;
  const companyName = publicCompanyName(invoice);
  const customerName = [invoice.customer.firstName, invoice.customer.lastName].filter(Boolean).join(" ") || invoice.customer.companyName || "Customer";
  const customerAddress = invoice.customer.addresses[0] || invoice.job?.address;
  const serviceDate = invoice.job?.scheduledStart || invoice.createdAt;
  const lines = invoiceLines(invoice);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice #${escapeHtml(invoice.invoiceNumber)} | ${escapeHtml(companyName)}</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #232735; }
    .shell { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 52px; }
    .brand { text-align: center; margin-bottom: 22px; }
    .brand-mark { display: inline-block; background: #3499f4; color: #071429; padding: 10px 22px; font-weight: 900; font-size: 28px; line-height: 0.95; }
    .brand-mark span { display: block; color: #fff; margin-left: 42px; }
    h1 { text-align: center; font-size: clamp(24px, 4vw, 34px); line-height: 1.2; margin: 10px 0 4px; }
    .amount-due { text-align: center; font-size: 19px; font-weight: 800; margin-bottom: 24px; }
    .tip-due-part { display: none; }
    .card { background: #fff; border: 1px solid #e3e6eb; border-radius: 8px; box-shadow: 0 8px 26px rgba(25, 32, 46, .08); margin-bottom: 18px; overflow: hidden; }
    .card h2 { font-size: 20px; margin: 0; padding: 16px 20px; border-bottom: 1px solid #e6e8ed; }
    .card-body { padding: 20px; }
    .tip-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
    .tip-grid button { height: 42px; border: 1px solid #d2d7df; border-radius: 8px; background: #fff; color: #868b94; font-size: 16px; cursor: pointer; }
    .tip-grid .selected { border-color: #0b74de; color: #0b74de; }
    .custom-tip { display: none; margin-top: 14px; }
    .custom-tip input { width: 180px; border: 1px solid #d2d7df; border-radius: 8px; padding: 11px 12px; font: inherit; }
    .payment-layout { display: grid; grid-template-columns: 1fr; gap: 18px; }
    .payment-card-body { display: grid; justify-items: center; }
    #payment-form { width: min(560px, 100%); display: grid; justify-items: center; }
    #payment-element { width: 100%; padding: 8px 0 18px; }
    .pay-button, .checkout-button { width: min(320px, 100%); display: inline-flex; justify-content: center; align-items: center; text-align: center; border: 0; border-radius: 999px; background: #3f3df2; color: #fff; padding: 14px 18px; font-weight: 800; font-size: 16px; cursor: pointer; text-decoration: none; box-shadow: 0 8px 18px rgba(63, 61, 242, .2); }
    .pay-button:hover, .checkout-button:hover { background: #1918d8; }
    .pay-button:disabled { background: #d9dce2; cursor: wait; }
    .muted { color: #697386; font-size: 13px; line-height: 1.45; }
    .message { margin-top: 14px; font-weight: 700; }
    .message.error { color: #b42318; }
    .message.ok { color: #137333; }
    .invoice-paper { background: #fff; border: 1px solid #dcdfe5; padding: 28px; min-height: 420px; }
    .invoice-summary-title { font-size: 20px; font-weight: 800; margin: 0; padding: 16px 20px; border-bottom: 1px solid #e6e8ed; background: #fff; }
    .invoice-head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #dcdfe5; padding-bottom: 18px; }
    .invoice-head strong { display: block; font-size: 18px; }
    .invoice-meta { border: 1px solid #bfc5cf; min-width: 260px; }
    .invoice-meta div { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
    .invoice-meta div:last-child { border-bottom: 0; font-weight: 900; font-size: 18px; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 28px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #767b86; color: #fff; text-align: left; padding: 9px; font-weight: 700; }
    td { border-bottom: 1px solid #e5e7eb; padding: 10px 9px; vertical-align: top; }
    td:last-child, th:last-child { text-align: right; }
    .totals { margin-left: auto; width: min(320px, 100%); display: grid; grid-template-columns: 1fr auto; gap: 8px 18px; padding-top: 18px; }
    .totals strong { font-size: 20px; }
    .tip-total-row { display: none; }
    @media (max-width: 820px) {
      .party-grid, .invoice-head { grid-template-columns: 1fr; display: grid; }
      .tip-grid { grid-template-columns: repeat(2, 1fr); }
      .invoice-paper { padding: 18px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand"><div class="brand-mark">Affordable<span>Security</span></div></div>
    <h1>Review &amp; pay your invoice from ${escapeHtml(companyName)}</h1>
    <div class="amount-due"><span id="invoice-base-due">${escapeHtml(cents(invoice.total))}</span><span class="tip-due-part" id="tip-due-part"> + <span id="tip-due-amount">$0.00</span></span> due</div>

    <section class="card">
      <h2>Add a tip</h2>
      <div class="card-body tip-grid">
        <button type="button" data-tip-percent="10">10%</button><button type="button" data-tip-percent="15">15%</button><button type="button" data-tip-percent="20">20%</button><button class="selected" type="button" data-tip-amount="0">No Tip</button><button type="button" data-tip-custom="true">Custom</button>
      </div>
      <div class="card-body custom-tip" id="custom-tip-row"><input id="custom-tip-input" inputmode="decimal" placeholder="Custom tip" /></div>
    </section>

    <div class="payment-layout">
      <section class="card">
        <h2>Payment Method</h2>
        <div class="card-body payment-card-body">
          ${configurationError ? `<p class="message error">${escapeHtml(configurationError)}</p>` : clientSecret && input.publishableKey ? `
            <form id="payment-form">
              <div id="payment-element"></div>
              <button id="pay-button" class="pay-button" type="submit">Pay ${escapeHtml(cents(invoice.total))}</button>
              <p class="muted">Payment details are encrypted and processed securely by Stripe. Affordable Security does not store full card or bank numbers.</p>
              <div id="payment-message" class="message" role="alert"></div>
            </form>
          ` : checkoutUrl ? `
            <a class="checkout-button" href="${escapeHtml(checkoutUrl)}">Pay ${escapeHtml(cents(invoice.total))}</a>
          ` : `<p class="message error">Payment is not configured for this invoice.</p>`}
        </div>
      </section>

      <section class="card">
        <h2 class="invoice-summary-title">Invoice Summary</h2>
        <div class="invoice-paper">
        <div class="invoice-head">
          <div><strong>${escapeHtml(companyName)}</strong><span class="muted">${escapeHtml([invoice.location.street1, invoice.location.city, invoice.location.state, invoice.location.postalCode].filter(Boolean).join(", "))}</span></div>
          <div class="invoice-meta">
            <div><span>JOB</span><b>${escapeHtml(invoice.job?.jobNumber ? `#${invoice.job.jobNumber}` : "-")}</b></div>
            <div><span>INVOICE</span><b>#${escapeHtml(invoice.invoiceNumber)}</b></div>
            <div><span>DATE</span><b>${escapeHtml(serviceDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: invoice.location.timezone || "America/Phoenix" }))}</b></div>
            <div><span>AMOUNT DUE</span><strong>${escapeHtml(cents(invoice.total))}</strong></div>
          </div>
        </div>
        <div class="party-grid">
          <div><strong>${escapeHtml(customerName)}</strong><br />${escapeHtml([customerAddress?.street1, customerAddress?.street2, customerAddress?.city, customerAddress?.state, customerAddress?.postalCode].filter(Boolean).join(", "))}<br />${escapeHtml(invoice.customer.phone)}</div>
          <div><strong>Contact us</strong><br />${escapeHtml(invoice.location.phone || "(928) 580-2775")}<br />service@5802775.com</div>
        </div>
        <table>
          <thead><tr><th>Services</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
          <tbody>${lines.map((item) => {
            const quantity = Number(item.quantity || 1);
            const amount = Math.round(quantity * item.unitPrice);
            return `<tr><td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<br /><span class="muted">${escapeHtml(item.description)}</span>` : ""}</td><td>${escapeHtml(quantity)}</td><td>${escapeHtml(cents(item.unitPrice))}</td><td>${escapeHtml(cents(amount))}</td></tr>`;
          }).join("")}</tbody>
        </table>
        <div class="totals"><span>Subtotal</span><b>${escapeHtml(cents(invoice.subtotal))}</b><span>Tax</span><b>${escapeHtml(cents(invoice.tax))}</b><span class="tip-total-row" id="tip-total-label">Tip</span><b class="tip-total-row" id="tip-total-amount">$0.00</b><strong>Total</strong><strong id="invoice-total">${escapeHtml(cents(invoice.total))}</strong></div>
        </div>
      </section>
    </div>
  </main>

  ${(clientSecret && input.publishableKey) || checkoutUrl ? `<script>
    const invoiceTotal = ${invoice.total};
    let currentTip = 0;
    let currentClientSecret = ${JSON.stringify(clientSecret)};
    const embeddedPaymentsEnabled = ${clientSecret && input.publishableKey ? "true" : "false"};
    const stripe = embeddedPaymentsEnabled ? Stripe(${JSON.stringify(input.publishableKey)}, ${stripeAccount ? `{ stripeAccount: ${JSON.stringify(stripeAccount)} }` : "undefined"}) : null;
    let elements;
    let paymentElement;
    const form = document.getElementById("payment-form");
    const button = document.getElementById("pay-button");
    const checkoutButton = document.querySelector(".checkout-button");
    const message = document.getElementById("payment-message");
    const customTipRow = document.getElementById("custom-tip-row");
    const customTipInput = document.getElementById("custom-tip-input");
    const tipDuePart = document.getElementById("tip-due-part");
    const tipDueAmount = document.getElementById("tip-due-amount");
    const invoiceTotalNode = document.getElementById("invoice-total");
    const tipTotalRows = Array.from(document.querySelectorAll(".tip-total-row"));
    const tipTotalAmount = document.getElementById("tip-total-amount");
    const tipButtons = Array.from(document.querySelectorAll(".tip-grid button"));

    function dollars(cents) {
      return "$" + (cents / 100).toFixed(2);
    }

    function mountPaymentElement(clientSecret) {
      if (!embeddedPaymentsEnabled) return;
      document.getElementById("payment-element").innerHTML = "";
      elements = stripe.elements({ clientSecret, appearance: { theme: "stripe" } });
      paymentElement = elements.create("payment", { layout: "tabs" });
      paymentElement.mount("#payment-element");
    }

    function setVisibleTotal(tipAmount) {
      const total = invoiceTotal + tipAmount;
      invoiceTotalNode.textContent = dollars(total);
      tipDueAmount.textContent = dollars(tipAmount);
      tipDuePart.style.display = tipAmount > 0 ? "inline" : "none";
      tipTotalAmount.textContent = dollars(tipAmount);
      tipTotalRows.forEach((row) => {
        row.style.display = tipAmount > 0 ? "block" : "none";
      });
      if (button) button.textContent = "Pay " + dollars(total);
      if (checkoutButton) checkoutButton.textContent = "Pay " + dollars(total);
    }

    async function updateTip(tipAmount) {
      currentTip = Math.max(0, Math.round(tipAmount || 0));
      setVisibleTotal(currentTip);
      if (button) {
        button.disabled = true;
        button.textContent = "Updating...";
      }
      if (checkoutButton) {
        checkoutButton.setAttribute("aria-busy", "true");
        checkoutButton.textContent = "Updating...";
      }
      if (message) message.textContent = "";
      const response = await fetch(${JSON.stringify(`/pay/${invoice.invoiceNumber}/intent`)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipAmount: currentTip })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || (!body.clientSecret && !body.checkoutUrl)) {
        if (message) {
          message.textContent = body.error || "Unable to update payment amount.";
          message.className = "message error";
        }
        if (button) button.disabled = false;
        if (checkoutButton) checkoutButton.removeAttribute("aria-busy");
        setVisibleTotal(currentTip);
        return;
      }
      if (body.clientSecret) {
        currentClientSecret = body.clientSecret;
        mountPaymentElement(currentClientSecret);
      }
      if (body.checkoutUrl && checkoutButton) {
        checkoutButton.href = body.checkoutUrl;
      }
      if (button) button.disabled = false;
      if (checkoutButton) checkoutButton.removeAttribute("aria-busy");
      setVisibleTotal(currentTip);
    }

    tipButtons.forEach((tipButton) => {
      tipButton.addEventListener("click", () => {
        tipButtons.forEach((item) => item.classList.remove("selected"));
        tipButton.classList.add("selected");
        const percent = Number(tipButton.dataset.tipPercent || "0");
        const fixedAmount = tipButton.dataset.tipAmount !== undefined ? Number(tipButton.dataset.tipAmount) : null;
        const custom = tipButton.dataset.tipCustom === "true";
        customTipRow.style.display = custom ? "block" : "none";
        if (custom) {
          customTipInput.focus();
          updateTip(Math.round(Number(customTipInput.value.replace(/[^0-9.]/g, "") || "0") * 100));
        } else if (fixedAmount !== null) {
          updateTip(fixedAmount);
        } else {
          updateTip(Math.round(invoiceTotal * (percent / 100)));
        }
      });
    });

    customTipInput.addEventListener("input", () => {
      updateTip(Math.round(Number(customTipInput.value.replace(/[^0-9.]/g, "") || "0") * 100));
    });

    mountPaymentElement(currentClientSecret);
    if (form) form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      if (message) message.textContent = "";
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: ${JSON.stringify(`${env.PUBLIC_BASE_URL}/pay/${invoice.invoiceNumber}/complete`)} }
      });
      if (error) {
        if (message) {
          message.textContent = error.message || "Payment could not be completed.";
          message.className = "message error";
        }
        button.disabled = false;
      }
    });
  </script>` : ""}
</body>
</html>`;
}

publicPayRouter.get("/:invoiceNumber/complete", asyncHandler(async (req, res) => {
  const invoiceNumber = invoiceNumberFromParam(String(req.params.invoiceNumber));
  if (!invoiceNumber) return res.status(404).send("Invoice not found");
  const invoice = await loadInvoice(invoiceNumber);
  if (!invoice) return res.status(404).send("Invoice not found");
  let confirmed = invoice.status === "PAID";
  try {
    confirmed = confirmed || await reconcileStripeReturn(invoice, req.query);
  } catch {
    confirmed = invoice.status === "PAID";
  }
  res.status(200).send(`<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${confirmed ? "Payment confirmed" : "Payment received"}</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f6f7f9;color:#232735;display:grid;min-height:100vh;place-items:center;margin:0}.card{background:#fff;border:1px solid #e3e6eb;border-radius:12px;padding:32px;max-width:560px;box-shadow:0 8px 26px rgba(25,32,46,.08)}h1{margin-top:0}</style></head><body><section class="card"><h1>${confirmed ? "Payment confirmed" : "Payment received"}</h1><p>${confirmed ? `Thank you. Invoice #${escapeHtml(invoice.invoiceNumber)} has been marked paid.` : `Thank you. Invoice #${escapeHtml(invoice.invoiceNumber)} is being confirmed. You may close this page.`}</p><p><a href="/pay/${escapeHtml(invoice.invoiceNumber)}">View invoice</a></p></section></body></html>`);
}));

publicPayRouter.post("/:invoiceNumber/intent", asyncHandler(async (req, res) => {
  const invoiceNumber = invoiceNumberFromParam(String(req.params.invoiceNumber));
  if (!invoiceNumber) return res.status(404).json({ error: "Invoice not found" });
  const invoice = await loadInvoice(invoiceNumber);
  if (!invoice || invoice.status === "VOID") return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === "PAID") return res.status(409).json({ error: "Invoice is already paid" });
  if (invoice.total <= 0) return res.status(422).json({ error: "This invoice does not have an amount due" });

  const input = tipSchema.parse(req.body);
  const config = await getLocationStripeConfig(invoice.locationId);
  if (!config.publishableKey) {
    const checkout = await createInvoiceCheckoutSession(invoice, env.PUBLIC_BASE_URL, { tipAmount: input.tipAmount });
    return res.json({
      checkoutUrl: checkout.url,
      amount: invoice.total + input.tipAmount,
      tipAmount: input.tipAmount
    });
  }

  const intent = await createInvoicePaymentIntent(invoice, {
    amount: invoice.total + input.tipAmount,
    tipAmount: input.tipAmount
  });
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { stripePaymentIntentId: intent.id }
  });
  res.json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    amount: intent.amount,
    tipAmount: input.tipAmount
  });
}));

publicPayRouter.get("/:invoiceNumber", asyncHandler(async (req, res) => {
  const invoiceNumber = invoiceNumberFromParam(String(req.params.invoiceNumber));
  if (!invoiceNumber) return res.status(404).send("Invoice not found");

  const invoice = await loadInvoice(invoiceNumber);
  if (!invoice || invoice.status === "VOID") return res.status(404).send("Invoice not found");
  if (invoice.status === "PAID") return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Invoice paid</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f6f7f9;color:#232735;display:grid;min-height:100vh;place-items:center;margin:0}.card{background:#fff;border:1px solid #e3e6eb;border-radius:12px;padding:32px;max-width:560px;box-shadow:0 8px 26px rgba(25,32,46,.08)}h1{margin-top:0}</style></head><body><section class="card"><h1>Invoice paid</h1><p>Invoice #${escapeHtml(invoice.invoiceNumber)} has already been paid.</p></section></body></html>`);
  if (invoice.total <= 0) return res.status(422).send("This invoice does not have an amount due.");

  let clientSecret: string | null | undefined;
  let publishableKey = "";
  let stripeAccount: string | null = null;
  let checkoutUrl: string | null = null;
  let configurationError: string | null = null;

  try {
    const config = await getLocationStripeConfig(invoice.locationId);
    stripeAccount = config.accountId;
    publishableKey = config.publishableKey;
    const intent = await createInvoicePaymentIntent(invoice);
    clientSecret = intent.client_secret;
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripePaymentIntentId: intent.id }
    });
  } catch (err) {
    configurationError = err instanceof Error ? err.message : "Unable to start embedded payment.";
  }

  if (!publishableKey) {
    try {
      const checkout = await createInvoiceCheckoutSession(invoice, env.PUBLIC_BASE_URL);
      checkoutUrl = checkout.url;
      configurationError = null;
    } catch {
      configurationError = "Stripe publishable key is missing. Add it in CRM Stripe settings to show the embedded payment form.";
    }
  }

  res.status(200).send(renderInvoicePayPage({ invoice, clientSecret, stripeAccount, publishableKey, checkoutUrl, configurationError }));
}));
