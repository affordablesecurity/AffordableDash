CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'CONVERTED');

CREATE TABLE "Estimate" (
  "id" TEXT NOT NULL,
  "estimateNumber" SERIAL NOT NULL,
  "locationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "addressId" TEXT,
  "technicianId" TEXT,
  "convertedJobId" TEXT,
  "title" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "leadSource" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledStart" TIMESTAMP(3),
  "scheduledEnd" TIMESTAMP(3),
  "description" TEXT,
  "internalNotes" TEXT,
  "approvalSignature" TEXT,
  "approvalName" TEXT,
  "approvedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EstimateLineItem" (
  "id" TEXT NOT NULL,
  "estimateId" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'service',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "unitCost" INTEGER NOT NULL DEFAULT 0,
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Estimate_estimateNumber_key" ON "Estimate"("estimateNumber");
CREATE UNIQUE INDEX "Estimate_convertedJobId_key" ON "Estimate"("convertedJobId");

ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_convertedJobId_fkey" FOREIGN KEY ("convertedJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
