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

    // --- FILTRES ---
    // Récupérer les paramètres de filtre
    const params = url.searchParams;
    // Helper to get array from query params, supporting both ?param=1,2 and ?param[]=1&param[]=2
    const getArrayParam = (param: string) => {
      // Support for ?param[]=a&param[]=b
      const arr = params.getAll(`${param}[]`);
      if (arr.length > 0) {
        return arr.map((v) => v.trim()).filter(Boolean);
      }
      // Fallback for ?param=a,b
      const val = params.get(param);
      if (!val) return undefined;
      return val.split(',').map((v) => v.trim()).filter(Boolean);
    };
    // Filtres inclus/exclus
    const productTypesIncluded = getArrayParam('product_types_included');
    const productTypesExcluded = getArrayParam('product_types_excluded');
    const collectionsIncluded = getArrayParam('collections_included');
    const collectionsExcluded = getArrayParam('collections_excluded');
    const vendorsIncluded = getArrayParam('vendors_included');
    const vendorsExcluded = getArrayParam('vendors_excluded');
    const categoriesIncluded = getArrayParam('categories_included');
    const categoriesExcluded = getArrayParam('categories_excluded');
    const createdFrom = params.get('created_from');
    const createdTo = params.get('created_to');
    const isActive = params.get('is_active');

    // Construction du paramètre 'query' pour Shopify
    let shopifyQueryParts: string[] = [];
    // Catégories (product_type)
    if (productTypesIncluded) {
      shopifyQueryParts.push(productTypesIncluded.map((cat) => `product_type:'${cat.replace(/'/g, "\\'")}'`).join(' OR '));
    }
    if (productTypesExcluded) {
      shopifyQueryParts.push(productTypesExcluded.map((cat) => `-product_type:'${cat.replace(/'/g, "\\'")}'`).join(' '));
    }
    // Fournisseurs (vendor)
    if (vendorsIncluded) {
      shopifyQueryParts.push(vendorsIncluded.map((v) => `vendor:'${v.replace(/'/g, "\\'")}'`).join(' OR '));
    }
    if (vendorsExcluded) {
      shopifyQueryParts.push(vendorsExcluded.map((v) => `-vendor:'${v.replace(/'/g, "\\'")}'`).join(' '));
    }
    // Statut actif
    if (isActive !== null && isActive !== undefined) {
      if (isActive === 'true') shopifyQueryParts.push(`status:ACTIVE`);
      if (isActive === 'false') shopifyQueryParts.push(`-status:ACTIVE`);
    }
    // Dates de création
    if (createdFrom) {
      shopifyQueryParts.push(`created_at:>='${createdFrom}'`);
    }
    if (createdTo) {
      shopifyQueryParts.push(`created_at:<='${createdTo}'`);
    }
    const shopifyQuery = shopifyQueryParts.join(' ');
    // --- FIN FILTRES ---

    // Pagination dynamique
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(250, parseInt(params.get('page_size') || '250', 10)));

    // Fonction pour récupérer tous les produits avec pagination GraphQL
    async function getAllProductsWithPagination(query: string | undefined) {
      let allProducts: any[] = [];
      let hasNextPage = true;
      let cursor: string | null = null;

      while (hasNextPage) {
        const productsQuery = `
          query getAllProducts($first: Int!, $after: String, $query: String) {
            products(first: $first, after: $after, query: $query) {
              pageInfo {
                hasNextPage
                endCursor
              }
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
                  images(first: 250) {
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
                  collections(first: 250) {
                    edges {
                      node {
                        id
                        title
                        handle
                      }
                    }
                  }
                  category {
                    id
                    name
                  }
                }
              }
            }
          }
        `;

        const response: Response = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token || '',
          },
          body: JSON.stringify({
            query: productsQuery,
            variables: { 
              first: 250, // Limite max de Shopify
              after: cursor,
              query: query || undefined 
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status}`);
        }

        const productsData: any = await response.json();
        
        if (!productsData.data || !productsData.data.products) {
          throw new Error("Réponse Shopify invalide");
        }

        const products = productsData.data.products.edges.map((edge: any) => edge.node);
        allProducts.push(...products);

        hasNextPage = productsData.data.products.pageInfo.hasNextPage;
        cursor = productsData.data.products.pageInfo.endCursor;
      }

      return allProducts;
    }

    // Récupérer tous les produits
    let products = await getAllProductsWithPagination(shopifyQuery || undefined);

    // --- FILTRES COLLECTIONS côté Node ---
    if (collectionsIncluded) {
      products = products.filter((product: any) => {
        const productCollections = product.collections?.edges?.map((e: any) => e.node) || [];
        // On accepte le filtre par handle (nom) ou par id
        return productCollections.some((c: any) => collectionsIncluded.includes(c.handle) || collectionsIncluded.includes(c.id));
      });
    }
    if (collectionsExcluded) {
      products = products.filter((product: any) => {
        const productCollections = product.collections?.edges?.map((e: any) => e.node) || [];
        return !productCollections.some((c: any) => collectionsExcluded.includes(c.handle) || collectionsExcluded.includes(c.id));
      });
    }
    // --- FIN FILTRES COLLECTIONS ---

    // --- FILTRES CATEGORIES côté Node ---
    if (categoriesIncluded) {
      products = products.filter((product: any) => {
        const catName = product.category?.name;
        const catId = product.category?.id;
        return (catName && categoriesIncluded.includes(catName)) || (catId && categoriesIncluded.includes(catId));
      });
    }
    if (categoriesExcluded) {
      products = products.filter((product: any) => {
        const catName = product.category?.name;
        const catId = product.category?.id;
        return !((catName && categoriesExcluded.includes(catName)) || (catId && categoriesExcluded.includes(catId)));
      });
    }
    // --- FIN FILTRES CATEGORIES ---

    const totalProductsRest = products.length;
    const pageCount = Math.max(1, Math.ceil(totalProductsRest / pageSize));
    
    // Découper les produits pour la page demandée
    const paginatedProducts = products.slice((page - 1) * pageSize, page * pageSize);

    return json({
      stats: {
        page,
        page_count: pageCount,
        page_size: pageSize,
        total_products: totalProductsRest
      },
      products: paginatedProducts
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
