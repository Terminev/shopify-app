import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db/index.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  
  if (!token) {
    return json(
      { 
        success: false, 
        error: "Token d'authentification requis. Utilisez ?token=VOTRE_TOKEN" 
      },
      { status: 401 }
    );
  }

  // Vérifier si c'est un token Shopify valide (commence par shpua_)
  if (!token.startsWith("shpua_")) {
    return json(
      { 
        success: false, 
        error: "Format de token invalide. Le token doit commencer par 'shpua_'" 
      },
      { status: 401 }
    );
  }

  // Trouver la boutique et mettre à jour le token
  const shopSettings = await prisma.shopSetting.findFirst();
  
  if (!shopSettings) {
    return json(
      { 
        success: false, 
        error: "Aucune boutique configurée" 
      },
      { status: 404 }
    );
  }

  // Mettre à jour le token en base
  await prisma.shopSetting.update({
    where: { id: shopSettings.id },
    data: { shopifyToken: token }
  });

  // Récupérer les produits via l'API Shopify Admin
  try {
    const shopDomain = shopSettings.shop;
    const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;
    
    const productsQuery = `
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
              variants(first: 250) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    compareAtPrice
                    inventoryQuantity
                    barcode
                    taxable
                  }
                }
              }
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
      }
    `;

    const response = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: productsQuery,
        variables: { first: 250 }
      })
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const productsData = await response.json();
    
    // Debug: voir la réponse exacte
    console.log('Shopify API Response:', JSON.stringify(productsData, null, 2));
    
    if (!productsData.data || !productsData.data.products) {
      return json(
        { 
          success: false, 
          error: "Réponse Shopify invalide",
          debug: {
            response: productsData,
            shopDomain: shopDomain,
            token: token.substring(0, 10) + "..."
          }
        },
        { status: 500 }
      );
    }

    const products = productsData.data.products.edges.map((edge: any) => edge.node);

    return json({
      success: true,
      message: "Produits récupérés avec succès",
      shop: shopSettings.shop,
      count: products.length,
      products: products,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    return json(
      { 
        success: false, 
        error: `Erreur lors de la récupération des produits: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}; 