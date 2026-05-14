ALTER TABLE "Job" ADD COLUMN "leadSource" TEXT;
ALTER TABLE "Job" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "CrmOption" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmOption_locationId_kind_name_key" ON "CrmOption"("locationId", "kind", "name");
CREATE INDEX "CrmOption_locationId_kind_idx" ON "CrmOption"("locationId", "kind");

ALTER TABLE "CrmOption" ADD CONSTRAINT "CrmOption_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
