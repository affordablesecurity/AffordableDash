CREATE TABLE "PriceBookCategory" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBookCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceBookItem" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "modelNumber" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'service',
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "onlineBooking" BOOLEAN NOT NULL DEFAULT false,
    "imageName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBookItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceBookCategory_locationId_name_key" ON "PriceBookCategory"("locationId", "name");
CREATE INDEX "PriceBookItem_locationId_itemType_idx" ON "PriceBookItem"("locationId", "itemType");
CREATE INDEX "PriceBookItem_locationId_categoryId_idx" ON "PriceBookItem"("locationId", "categoryId");

ALTER TABLE "PriceBookCategory" ADD CONSTRAINT "PriceBookCategory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PriceBookCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
