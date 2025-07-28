export function parseProductFilters(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const getArrayParam = (param: string) => {
    const arr = params.getAll(`${param}[]`);
    if (arr.length > 0) return arr.map((v) => v.trim()).filter(Boolean);
    const val = params.get(param);
    if (!val) return undefined;
    return val.split(',').map((v) => v.trim()).filter(Boolean);
  };
  return {
    productTypesIncluded: getArrayParam('product_types_included'),
    productTypesExcluded: getArrayParam('product_types_excluded'),
    collectionsIncluded: getArrayParam('collections_included'),
    collectionsExcluded: getArrayParam('collections_excluded'),
    vendorsIncluded: getArrayParam('vendors_included'),
    vendorsExcluded: getArrayParam('vendors_excluded'),
    categoriesIncluded: getArrayParam('categories_included'),
    categoriesExcluded: getArrayParam('categories_excluded'),
    createdFrom: params.get('created_from'),
    createdTo: params.get('created_to'),
    isActive: params.get('is_active'),
  };
}

export function buildShopifyQuery(filters: ReturnType<typeof parseProductFilters>) {
  let shopifyQueryParts: string[] = [];
  if (filters.productTypesIncluded) {
    shopifyQueryParts.push(filters.productTypesIncluded.map((cat) => `product_type:'${cat.replace(/'/g, "\\'")}'`).join(' OR '));
  }
  if (filters.productTypesExcluded) {
    shopifyQueryParts.push(filters.productTypesExcluded.map((cat) => `-product_type:'${cat.replace(/'/g, "\\'")}'`).join(' '));
  }
  if (filters.vendorsIncluded) {
    shopifyQueryParts.push(filters.vendorsIncluded.map((v) => `vendor:'${v.replace(/'/g, "\\'")}'`).join(' OR '));
  }
  if (filters.vendorsExcluded) {
    shopifyQueryParts.push(filters.vendorsExcluded.map((v) => `-vendor:'${v.replace(/'/g, "\\'")}'`).join(' '));
  }
  if (filters.isActive !== null && filters.isActive !== undefined) {
    if (filters.isActive === 'true') shopifyQueryParts.push(`status:ACTIVE`);
    if (filters.isActive === 'false') shopifyQueryParts.push(`-status:ACTIVE`);
  }
  if (filters.createdFrom) {
    shopifyQueryParts.push(`created_at:>='${filters.createdFrom}'`);
  }
  if (filters.createdTo) {
    shopifyQueryParts.push(`created_at:<='${filters.createdTo}'`);
  }
  return shopifyQueryParts.join(' ');
}

export async function getAllProductsWithPagination(adminUrl: string, token: string, shopifyQuery: string, allProductFields: boolean = false) {
  let allProducts: any[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let productsQuery: string;

  while (hasNextPage) {
    if (allProductFields) {
      productsQuery = `
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
                seo {
                  title
                  description
                }
              }
            }
          }
        }
    `;
    } else {
      productsQuery = `
        query getAllProducts($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query) {
            pageInfo { hasNextPage endCursor }
            edges { node {
              id
              collections(first: 250) { edges { node { id handle } } }
              category { id name }
              productType
            }}
          }
        }
      `;
    }

    const response: Response = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token || '',
      },
      body: JSON.stringify({
        query: productsQuery,
        variables: { first: 250, after: cursor, query: shopifyQuery || undefined }
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

export function applyNodeSideFilters(products: any[], filters: ReturnType<typeof parseProductFilters>) {
  // Collections
  if (filters.collectionsIncluded) {
    products = products.filter((product: any) => {
      const productCollections = product.collections?.edges?.map((e: any) => e.node) || [];
      return productCollections.some((c: any) => filters.collectionsIncluded!.includes(c.handle) || filters.collectionsIncluded!.includes(c.id));
    });
  }
  if (filters.collectionsExcluded) {
    products = products.filter((product: any) => {
      const productCollections = product.collections?.edges?.map((e: any) => e.node) || [];
      return !productCollections.some((c: any) => filters.collectionsExcluded!.includes(c.handle) || filters.collectionsExcluded!.includes(c.id));
    });
  }
  // Catégories
  if (filters.categoriesIncluded) {
    products = products.filter((product: any) => {
      const catName = product.category?.name;
      const catId = product.category?.id;
      return (catName && filters.categoriesIncluded!.includes(catName)) || (catId && filters.categoriesIncluded!.includes(catId));
    });
  }
  if (filters.categoriesExcluded) {
    products = products.filter((product: any) => {
      const catName = product.category?.name;
      const catId = product.category?.id;
      return !((catName && filters.categoriesExcluded!.includes(catName)) || (catId && filters.categoriesExcluded!.includes(catId)));
    });
  }
  return products;
} 