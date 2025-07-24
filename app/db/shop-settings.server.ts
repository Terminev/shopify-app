import { randomBytes } from "crypto";
import { prisma } from "./index.server";

export async function getOrCreateShopifyToken(shop: string) {
  console.log("getOrCreateShopifyToken called with shop:", shop);
  let setting = await prisma.shopSetting.findUnique({ where: { shop } });
  if (!setting) {
    const token = randomBytes(32).toString("hex");
    setting = await prisma.shopSetting.create({
      data: { shop, shopifyToken: token },
    });
    console.log("Created new shopSetting:", setting);
  } else if (!setting.shopifyToken) {
    const token = randomBytes(32).toString("hex");
    setting = await prisma.shopSetting.update({
      where: { shop },
      data: { shopifyToken: token },
    });
    console.log("Updated shopSetting with new token:", setting);
  } else {
    console.log("Found existing shopSetting:", setting);
  }
  return setting.shopifyToken;
}
