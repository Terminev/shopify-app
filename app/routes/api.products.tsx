import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Récupérer tous les produits avec leurs variantes et images
  const productsResponse = await admin.graphql(
    `#graphql
      query getAllProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              description
              status
              totalInventory
              createdAt
              updatedAt
              vendor
              productType
              tags

              images(first: 50) {
                edges {
                  node {
                    id
                    url
                    altText
                    width
                    height
                  }
                }
              }
              collections(first: 50) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
            }
          }
        }
      }`,
    {
      variables: { first: 250 }, // Limite à 250 produits
    }
  );

  const productsData = await productsResponse.json();
  const products = productsData.data.products.edges.map((edge: any) => edge.node);

  return json({
    success: true,
    count: products.length,
    products: products,
    timestamp: new Date().toISOString()
  });
}; 