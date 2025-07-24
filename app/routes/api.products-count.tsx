import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Récupérer le nombre de produits via l'API Shopify
  const productsResponse = await admin.graphql(
    `#graphql
      query getProductsCount {
        products(first: 250) {
          edges {
            node {
              id
            }
          }
        }
      }
    `
  );

  const productsData = await productsResponse.json();
  const products = productsData.data?.products?.edges || [];
  return json({ products_count: products.length });
}; 