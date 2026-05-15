ALTER TABLE "Message" ADD COLUMN "jobId" TEXT;
ALTER TABLE "Message" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "Message" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'sms';
ALTER TABLE "Message" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SENT';
ALTER TABLE "Message" ADD COLUMN "error" TEXT;
ALTER TABLE "Message" ADD COLUMN "templateKey" TEXT;

CREATE INDEX "Message_locationId_customerId_createdAt_idx" ON "Message"("locationId", "customerId", "createdAt");
CREATE INDEX "Message_jobId_idx" ON "Message"("jobId");
CREATE INDEX "Message_invoiceId_idx" ON "Message"("invoiceId");
