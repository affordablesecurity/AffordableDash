ALTER TABLE "Customer" ADD COLUMN "additionalEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Customer" ADD COLUMN "additionalPhones" JSONB;
ALTER TABLE "Customer" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Customer" ADD COLUMN "communicationPrefs" JSONB;
ALTER TABLE "Customer" ADD COLUMN "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Customer" ADD COLUMN "paymentMethodNote" TEXT;

CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "author" TEXT NOT NULL DEFAULT 'Office',
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
