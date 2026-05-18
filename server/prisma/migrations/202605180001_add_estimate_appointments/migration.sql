CREATE TABLE "EstimateAppointment" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "technicianId" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EstimateAppointment_locationId_scheduledStart_idx" ON "EstimateAppointment"("locationId", "scheduledStart");
CREATE INDEX "EstimateAppointment_estimateId_scheduledStart_idx" ON "EstimateAppointment"("estimateId", "scheduledStart");
CREATE INDEX "EstimateAppointment_technicianId_idx" ON "EstimateAppointment"("technicianId");

ALTER TABLE "EstimateAppointment" ADD CONSTRAINT "EstimateAppointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstimateAppointment" ADD CONSTRAINT "EstimateAppointment_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstimateAppointment" ADD CONSTRAINT "EstimateAppointment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
