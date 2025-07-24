import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db/index.server";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json({ success: false, error: shopifyAuth.error.message }, { status: shopifyAuth.error.status });
  }
  const { token, shopDomain, adminUrl } = shopifyAuth;

  // Vérifier que le token existe dans ShopSetting
  const shopSetting = await prisma.shopSetting.findFirst({
    where: { shopifyToken: token },
  });

  if (!shopSetting) {
    return json(
      {
        success: false,
        error: "Token invalide",
      },
      { status: 403 }
    );
  }

  // Appel à l'API Shopify pour compter les produits
  const productsQuery = `#graphql\n    query getProductsCount {\n      products(first: 250) {\n        edges {\n          node { id }\n        }\n      }\n    }`;

  const response = await fetch(adminUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query: productsQuery }),
  });

  if (!response.ok) {
    return json(
      {
        success: false,
        error: "Erreur Shopify API",
      },
      { status: 502 }
    );
  }

  const productsData = await response.json();
  const products = productsData.data?.products?.edges || [];
  return json({
    products_count: products.length,
  });
};