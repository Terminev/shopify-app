import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db/index.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json({ error: "Token d'authentification requis. Utilisez ?token=VOTRE_TOKEN" }, { status: 401 });
  }

  // Vérifier si c'est un token Shopify valide (commence par shpua_)
  if (!token.startsWith("shpua_")) {
    return json({ error: "Format de token invalide. Le token doit commencer par 'shpua_'" }, { status: 401 });
  }

  // Trouver la boutique
  const shopSettings = await prisma.shopSetting.findFirst();
  if (!shopSettings) {
    return json({ error: "Aucune boutique configurée" }, { status: 404 });
  }
  const shopDomain = shopSettings.shop;
  const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;

  // Récupérer les collections
  const collectionsQuery = `
    query getCollections {
      collections(first: 250) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  `;
  const collectionsResp = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: collectionsQuery })
  });
  const collectionsData = await collectionsResp.json();
  const collections = (collectionsData.data?.collections?.edges || []).map((edge: any) => ({
    value: edge.node.id,
    label: edge.node.title,
  }));

  // Récupérer les types de produits à partir des produits
  const productTypesQuery = `
    query getProductTypesFromProducts {
      products(first: 250) {
        edges {
          node {
            productType
          }
        }
      }
    }
  `;
  const productTypesResp = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: productTypesQuery })
  });
  const productTypesData = await productTypesResp.json();
  const allProductTypes = (productTypesData.data?.products?.edges || []).map((edge: any) => edge.node.productType);
  const uniqueProductTypes = Array.from(new Set(allProductTypes)).filter(Boolean);
  const product_types = (uniqueProductTypes as string[]).map((type) => ({
    value: type,
    label: type,
  }));

  // Récupérer les vendors (fournisseurs) à partir des produits
  const vendorsQuery = `
    query getVendorsFromProducts {
      products(first: 250) {
        edges {
          node {
            vendor
          }
        }
      }
    }
  `;
  const vendorsResp = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: vendorsQuery })
  });
  const vendorsData = await vendorsResp.json();
  const allVendors = (vendorsData.data?.products?.edges || []).map((edge: any) => edge.node.vendor);
  const uniqueVendors = Array.from(new Set(allVendors)).filter(Boolean);
  const vendors = (uniqueVendors as string[]).map((vendor) => ({
    value: vendor,
    label: vendor,
  }));

  return json({
    collections,
    product_types,
    vendors,
  });
}; 