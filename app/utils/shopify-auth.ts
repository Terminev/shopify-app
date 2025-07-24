import { prisma } from "../db/index.server";

export async function getShopifyAdminFromToken(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return { error: { status: 401, message: "Token d'authentification requis. Utilisez ?token=VOTRE_TOKEN" } };
  }
  if (!token.startsWith("shpua_")) {
    return { error: { status: 401, message: "Format de token invalide. Le token doit commencer par 'shpua_'" } };
  }

  const shopSettings = await prisma.shopSetting.findFirst();
  if (!shopSettings) {
    return { error: { status: 404, message: "Aucune boutique configurée" } };
  }
  const shopDomain = shopSettings.shop;
  const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;

  // Optionnel : update le token en base si tu veux garder ce comportement
  await prisma.shopSetting.update({
    where: { id: shopSettings.id },
    data: { shopifyToken: token }
  });

  return { token, shopDomain, adminUrl };
} 