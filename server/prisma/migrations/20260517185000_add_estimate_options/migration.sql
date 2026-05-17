CREATE TABLE "EstimateOption" (
  "id" TEXT NOT NULL,
  "estimateId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "imageName" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EstimateOption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Estimate" ADD COLUMN "approvedOptionId" TEXT;
ALTER TABLE "EstimateLineItem" ADD COLUMN "optionId" TEXT;

ALTER TABLE "EstimateOption" ADD CONSTRAINT "EstimateOption_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_approvedOptionId_fkey" FOREIGN KEY ("approvedOptionId") REFERENCES "EstimateOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "EstimateOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
