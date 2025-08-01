import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json({ error: shopifyAuth.error.message }, { status: shopifyAuth.error.status });
  }
  const { token, adminUrl } = shopifyAuth;

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

  // Récupérer les catégories des produits
  const categoriesQuery = `
    query getProductCategories {
      products(first: 250) {
        edges {
          node {
            category {
              id
              name
            }
          }
        }
      }
    }
  `;
  const categoriesResp = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: categoriesQuery })
  });
  const categoriesData = await categoriesResp.json();
  const allCategories = (categoriesData.data?.products?.edges || [])
    .map((edge: any) => edge.node.category)
    .filter(Boolean); // Filtrer les catégories null/undefined
  const uniqueCategories = Array.from(new Set(allCategories.map((cat: any) => cat.id)));
  const categories = uniqueCategories.map((categoryId: any) => {
    const category = allCategories.find((cat: any) => cat.id === categoryId);
    return {
      value: category.id,
      label: category.name,
    };
  });

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

  /* Get all vendors */
  const vendorsResp = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: vendorsQuery })
  });

  /* Get all vendors */
  const vendorsData = await vendorsResp.json();
  const allVendors = (vendorsData.data?.products?.edges || []).map((edge: any) => edge.node.vendor);
  const uniqueVendors = Array.from(new Set(allVendors)).filter(Boolean);
  const vendors = (uniqueVendors as string[]).map((vendor) => ({
    value: vendor,
    label: vendor,
  }));

  return json({
    collections,
    categories,
    product_types,
    vendors,
  });
}; 