import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db/index.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Protection par token (header ou paramètre)
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
      { status: 401 },
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
      { status: 403 },
    );
  }

  // Appel à l'API Shopify pour récupérer les produits (pour extraire brands et catégories)
  const adminUrl = `https://${shopSetting.shop}/admin/api/2024-01/graphql.json`;
  const productsQuery = `#graphql\n    query getAllProducts($first: Int!) {\n      products(first: $first) {\n        edges {\n          node {\n            id\n            vendor\n            productType\n          }\n        }\n      }\n    }`;

  const response = await fetch(adminUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query: productsQuery, variables: { first: 250 } }),
  });

  if (!response.ok) {
    return json(
      {
        success: false,
        error: "Erreur Shopify API",
      },
      { status: 502 },
    );
  }

  const productsData = await response.json();
  const products =
    productsData.data?.products?.edges?.map((edge: any) => edge.node) || [];

  // Extraire les brands (vendors distincts)
  const vendorSet = new Set<string>();
  products.forEach((p: any) => {
    if (p.vendor) vendorSet.add(p.vendor);
  });
  const brands = Array.from(vendorSet).map((vendor, idx) => ({
    value: String(idx + 1),
    label: vendor,
  }));  

  // Extraire les catégories (productType distincts)
  const categorySet = new Set<string>();
  products.forEach((p: any) => {
    if (p.productType) categorySet.add(p.productType);
  });
  const categories = Array.from(categorySet).map((cat, idx) => ({
    value: String(idx + 1),
    label: cat,
    parent: null,
  }));

  return json({ brands, categories });
};
