CREATE TABLE "JobTemplate" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "leadSource" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "privateNotes" TEXT,
  "lineItems" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JobTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobTemplate_locationId_name_key" ON "JobTemplate"("locationId", "name");
CREATE INDEX "JobTemplate_locationId_idx" ON "JobTemplate"("locationId");

ALTER TABLE "JobTemplate"
  ADD CONSTRAINT "JobTemplate_locationId_fkey"
  FOREIGN KEY ("locationId")
  REFERENCES "Location"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
