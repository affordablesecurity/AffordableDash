ALTER TABLE "Technician" ADD COLUMN "employmentType" TEXT NOT NULL DEFAULT 'employee';
ALTER TABLE "Technician" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'OUTSIDE_FIELD_TECH';
ALTER TABLE "Technician" ADD COLUMN "fieldTech" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Technician" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY['jobs:write', 'customers:write', 'invoices:write']::TEXT[];
