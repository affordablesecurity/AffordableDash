ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "Technician" ADD COLUMN "userId" TEXT;
CREATE INDEX "Technician_locationId_userId_idx" ON "Technician"("locationId", "userId");
