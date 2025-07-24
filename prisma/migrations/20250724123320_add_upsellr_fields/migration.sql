-- CreateTable
CREATE TABLE "ShopSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyToken" TEXT,
    "upsellrApiKey" TEXT,
    "upsellrApiUrl" TEXT,
    "lastSync" DATETIME,
    "productsSynced" INTEGER NOT NULL DEFAULT 0,
    "productsImported" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSetting_shop_key" ON "ShopSetting"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSetting_shopifyToken_key" ON "ShopSetting"("shopifyToken");
