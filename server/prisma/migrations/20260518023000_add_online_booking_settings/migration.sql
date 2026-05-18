CREATE TABLE "OnlineBookingSettings" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "serviceAreaZipCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "helpHeading" TEXT NOT NULL DEFAULT 'What do you need help with?',
    "servicePrompt" TEXT NOT NULL DEFAULT 'Please select your service',
    "slotStartHour" INTEGER NOT NULL DEFAULT 8,
    "slotEndHour" INTEGER NOT NULL DEFAULT 18,
    "slotWindowMinutes" INTEGER NOT NULL DEFAULT 120,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnlineBookingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnlineBookingSettings_locationId_key" ON "OnlineBookingSettings"("locationId");

ALTER TABLE "OnlineBookingSettings" ADD CONSTRAINT "OnlineBookingSettings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
