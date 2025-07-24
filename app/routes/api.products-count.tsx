import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db/index.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Récupérer le token depuis le header ou l'URL
  const url = new URL(request.url);
  const token =
    request.headers.get("x-shopify-access-token") ||
    url.searchParams.get("token");

  if (!token) {
    return json(
      {
        success: false, 
        error: "Token d'authentification requis",
      },
      { status: 401 }
    );
  }

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
  const adminUrl = `https://${shopSetting.shop}/admin/api/2024-01/graphql.json`;
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