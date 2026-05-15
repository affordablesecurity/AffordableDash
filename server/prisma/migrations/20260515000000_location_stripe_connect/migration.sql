-- Allow each location to connect its own Stripe account.
ALTER TABLE "IntegrationCredential" ADD COLUMN "locationId" TEXT;

DROP INDEX IF EXISTS "IntegrationCredential_organizationId_provider_key";

CREATE UNIQUE INDEX "IntegrationCredential_locationId_provider_key" ON "IntegrationCredential"("locationId", "provider");

ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
