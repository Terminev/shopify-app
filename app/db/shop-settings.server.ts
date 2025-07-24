import { randomBytes } from "crypto";
import { prisma } from "./index.server";

export async function getOrCreateShopifyToken(shop: string) {
  let setting = await prisma.shopSetting.findUnique({ where: { shop } });
  if (!setting) {
    const token = randomBytes(32).toString("hex");
    setting = await prisma.shopSetting.create({
      data: { shop, shopifyToken: token },
    });
  } else if (!setting.shopifyToken) {
    const token = randomBytes(32).toString("hex");
    setting = await prisma.shopSetting.update({
      where: { shop },
      data: { shopifyToken: token },
    });
  } else {
  }
  return setting.shopifyToken;
}
