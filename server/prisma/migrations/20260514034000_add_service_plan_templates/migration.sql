CREATE TABLE "ServicePlanTemplate" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "businessUnit" TEXT,
  "visitsPerYear" INTEGER NOT NULL DEFAULT 1,
  "durationType" TEXT NOT NULL DEFAULT 'indefinite',
  "billingInterval" TEXT NOT NULL DEFAULT 'yearly',
  "recurringAmount" INTEGER NOT NULL DEFAULT 0,
  "cashAllowed" BOOLEAN NOT NULL DEFAULT false,
  "discountDescription" TEXT,
  "discountPercent" INTEGER,
  "addOns" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServicePlanTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServicePlanTemplate_locationId_name_key" ON "ServicePlanTemplate"("locationId", "name");
CREATE INDEX "ServicePlanTemplate_locationId_active_idx" ON "ServicePlanTemplate"("locationId", "active");

ALTER TABLE "ServicePlanTemplate"
  ADD CONSTRAINT "ServicePlanTemplate_locationId_fkey"
  FOREIGN KEY ("locationId")
  REFERENCES "Location"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
