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
  let triedWithoutReferences = false;

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
                vendor
                productType
                tags
                metafields(first: 50) {
                  edges {
                    node {
                      key
                      value
                      namespace
                      type
                      references(first: 10) {
                        edges {
                          node {
                            ... on Metaobject {
                              id
                              type
                              fields {
                                key
                                value
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
                variants(first: 50) {
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
                images(first: 15) {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
                collections(first: 10) {
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
                metafield(namespace: "custom", key: "short_description") {
                  value
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
              collections(first: 15) { edges { node { id handle } } }
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
        variables: { first: 50, after: cursor, query: shopifyQuery || undefined }
      })
    });
    const productsData: any = await response.json();
    if (!productsData.data || !productsData.data.products) {
      console.error("Raw Shopify response:", JSON.stringify(productsData, null, 2));
      // Automatic fallback: if we haven't already tried without references, try again without this field
      if (!triedWithoutReferences && allProductFields) {
        triedWithoutReferences = true;
        // Remove 'references' from the query
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
                  vendor
                  productType
                  tags
                  metafields(first: 50) {
                    edges {
                      node {
                        key
                        value
                        namespace
                        type
                      }
                    }
                  }
                  variants(first: 50) {
                    edges {
                      node {
                        id
                        title
                        sku
                        price
                        compareAtPrice
                        inventoryQuantity
                        barcode
                      }
                    }
                  }
                  images(first: 15) {
                    edges {
                      node {
                        id
                        url
                        altText
                      }
                    }
                  }
                  collections(first: 15) {
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
                  metafield(namespace: "custom", key: "short_description") {
                    value
                  }
                }
              }
            }
          }
        `;
        // Restart the loop without advancing the cursor
        continue;
      }
      throw new Error("Invalid Shopify response");
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
  // Categories
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

/**
 * Retrieves the meta taxonomies automatically assigned according to the category
 * @param products List of products with their metadata
 * @returns Object containing meta taxonomies by category
 */
export function extractCategoryMetaTaxonomies(products: any[]) {
  const categoryMetaTaxonomies: { [categoryName: string]: any[] } = {};
  
  products.forEach((product) => {
    const categoryName = product.category?.name;
    if (!categoryName) return;
    
    // Retrieve the product's metafields
    const metafields = product.metafields?.edges?.map((edge: any) => edge.node) || [];
    
    // Filter metafields that appear to be automatic taxonomies
    const taxonomyMetafields = metafields.filter((metafield: any) => {
      // Look for metafields that could be automatic taxonomies
      // These metafields are often in specific namespaces or have particular keys
      const key = metafield.key?.toLowerCase() || '';
      const namespace = metafield.namespace?.toLowerCase() || '';
      
      // Patterns to identify automatic taxonomies
      const taxonomyPatterns = [
        'taxonomy',
        'category_meta',
        'auto_meta',
        'suggested',
        'recommended',
        'attributes',
        'specifications'
      ];
      
      return taxonomyPatterns.some(pattern => 
        key.includes(pattern) || namespace.includes(pattern)
      ) || namespace === 'specs'; // The 'specs' namespace often contains technical specifications
    });
    
    if (taxonomyMetafields.length > 0) {
      if (!categoryMetaTaxonomies[categoryName]) {
        categoryMetaTaxonomies[categoryName] = [];
      }
      
      // Add taxonomy metafields for this category
      taxonomyMetafields.forEach((metafield: any) => {
        const existingIndex = categoryMetaTaxonomies[categoryName].findIndex(
          (item: any) => item.key === metafield.key && item.namespace === metafield.namespace
        );
        
        if (existingIndex === -1) {
          categoryMetaTaxonomies[categoryName].push({
            namespace: metafield.namespace,
            key: metafield.key,
            value: metafield.value,
            type: metafield.type
          });
        }
      });
    }
  });
  
  return categoryMetaTaxonomies;
}

/**
 * Retrieves meta taxonomy suggestions for a specific category
 * @param products List of products
 * @param categoryName Name of the category
 * @returns List of metadata suggestions for this category
 */
export function getCategoryMetaSuggestions(products: any[], categoryName: string) {
  const categoryProducts = products.filter(product => 
    product.category?.name === categoryName
  );
  
  const suggestions: { [key: string]: any } = {};
  
  categoryProducts.forEach((product) => {
    const metafields = product.metafields?.edges?.map((edge: any) => edge.node) || [];
    
    metafields.forEach((metafield: any) => {
      const key = `${metafield.namespace}.${metafield.key}`;
      
      if (!suggestions[key]) {
        suggestions[key] = {
          namespace: metafield.namespace,
          key: metafield.key,
          type: metafield.type,
          values: new Set(),
          count: 0
        };
      }
      
      if (metafield.value) {
        suggestions[key].values.add(metafield.value);
        suggestions[key].count++;
      }
    });
  });
  
  // Convert Sets to Arrays and sort by frequency
  return Object.values(suggestions)
    .map(suggestion => ({
      ...suggestion,
      values: Array.from(suggestion.values),
      frequency: suggestion.count / categoryProducts.length
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

/**
 * Resolves metaobject references to get labels
 * @param metafield Metafield with its references
 * @param adminUrl Shopify admin API URL
 * @param token Authentication token
 * @returns Value with resolved labels
 */
async function resolveMetaobjectReferences(metafield: any, adminUrl?: string, token?: string): Promise<any> {
  // If there are no references in the response, try to fetch metaobjects separately
  if (!metafield.references?.edges?.length && (metafield.type === 'list.metaobject_reference' || metafield.type === 'metaobject_reference')) {
    if (!adminUrl || !token) {
      console.log(`⚠️ No context to resolve metaobjects: ${metafield.key}`);
      return metafield.value; // Not possible to resolve without context
    }

    try {
      // Parse the value to extract IDs
      let metaobjectIds: string[] = [];
      if (metafield.type === 'list.metaobject_reference') {
        try {
          metaobjectIds = JSON.parse(metafield.value);
        } catch (e) {
          console.log(`❌ Error parsing JSON for ${metafield.key}:`, e);
          return metafield.value;
        }
      } else {
        metaobjectIds = [metafield.value];
      }

      console.log(`🔍 Attempting to resolve ${metaobjectIds.length} metaobject(s) for ${metafield.key}:`, metaobjectIds);

      // Fetch metaobjects one by one
      const resolvedReferences = [];
      for (const metaobjectId of metaobjectIds) {
        const metaobjectQuery = `
          query getMetaobject($id: ID!) {
            metaobject(id: $id) {
              id
              type
              fields {
                key
                value
              }
            }
          }
        `;

        console.log(`📡 Metaobject request for ${metaobjectId}`);
        
        const response = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
          },
          body: JSON.stringify({
            query: metaobjectQuery,
            variables: { id: metaobjectId }
          })
        });

        const metaobjectData = await response.json();
        console.log(`📥 Metaobject response for ${metaobjectId}:`, JSON.stringify(metaobjectData, null, 2));

        if (metaobjectData.data?.metaobject) {
          const metaobject = metaobjectData.data.metaobject;
          console.log(`✅ Metaobject found:`, metaobject);
          
          const titleField = metaobject.fields.find((field: any) => 
            field.key === 'title' || field.key === 'name' || field.key === 'label'
          );
          
          const label = titleField?.value || metaobject.type;
          console.log(`🏷️ Label found: "${label}" (field: ${titleField?.key || 'type'})`);
          
          resolvedReferences.push({
            id: metaobjectId,
            label: label,
            type: metaobject.type
          });
        } else if (metaobjectData.errors) {
          console.error(`❌ GraphQL error for ${metaobjectId}:`, metaobjectData.errors);
          resolvedReferences.push({
            id: metaobjectId,
            label: 'Error: ' + metaobjectData.errors[0]?.message || 'Unknown',
            type: 'error'
          });
        } else {
          console.log(`❓ Metaobject not found for ${metaobjectId}`);
          resolvedReferences.push({
            id: metaobjectId,
            label: 'Unknown',
            type: 'unknown'
          });
        }
      }

      return metafield.type === 'list.metaobject_reference' ? resolvedReferences : resolvedReferences[0];
    } catch (error) {
      console.error('❌ Error while resolving metaobjects:', error);
      return metafield.value;
    }
  }

  // If we have references in the response
  if (metafield.references?.edges?.length) {
    const references = metafield.references.edges.map((edge: any) => edge.node);
    
    // If it's an array of references (like in JSON metafields)
    if (metafield.type === 'list.metaobject_reference' || metafield.type === 'json') {
      try {
        // Try to parse the value as JSON
        const valueArray = JSON.parse(metafield.value);
        if (Array.isArray(valueArray)) {
          return valueArray.map((refId: string) => {
            const reference = references.find((ref: any) => ref.id === refId);
            if (reference) {
              // Look for the 'title', 'name', or first available field
              const titleField = reference.fields.find((field: any) => 
                field.key === 'title' || field.key === 'name' || field.key === 'label'
              );
              return {
                id: refId,
                label: titleField?.value || reference.type,
                type: reference.type
              };
            }
            return { id: refId, label: 'Unknown', type: 'unknown' };
          });
        }
      } catch (e) {
        // If not JSON, treat as a simple reference
      }
    }

    // For simple references
    if (references.length === 1) {
      const reference = references[0];
      const titleField = reference.fields.find((field: any) => 
        field.key === 'title' || field.key === 'name' || field.key === 'label'
      );
      return {
        id: reference.id,
        label: titleField?.value || reference.type,
        type: reference.type
      };
    }
  }

  return metafield.value;
}

/**
 * Retrieves the meta taxonomies of a specific product with resolved labels
 * @param product Product with its metadata
 * @param adminUrl Shopify admin API URL (optional, to resolve metaobjects)
 * @param token Authentication token (optional, to resolve metaobjects)
 * @returns Object containing the product's meta taxonomies
 */
export async function getProductMetaTaxonomies(product: any, adminUrl?: string, token?: string, skipMetaobjectResolution?: boolean) {
  const metafields = product.metafields?.edges?.map((edge: any) => edge.node) || [];
  const taxonomies: { [key: string]: any } = {};
  
  for (const metafield of metafields) {
    const key = `${metafield.namespace || 'undefined'}.${metafield.key}`;
    
    // Resolve metaobject references (now async)
    const resolvedValue = skipMetaobjectResolution ? metafield.value : await resolveMetaobjectReferences(metafield, adminUrl, token);
    
    taxonomies[key] = {
      namespace: metafield.namespace,
      key: metafield.key,
      value: resolvedValue,
      type: metafield.type,
      original_value: metafield.value // Keep the original value for reference
    };
  }
  
  return taxonomies;
} 

/**
 * Retrieves the shop's language
 * @param adminUrl Shopify admin API URL
 * @param token Authentication token
 * @returns The shop's language
 */
async function getShopLanguage(adminUrl: string, token: string): Promise<string> {
  try {
    const query = `
      query {
        shop {
          primaryDomain {
            locale
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
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return 'en';
    }

    const data = await response.json();
    if (data.errors) {
      return 'en';
    }

    return data.data?.shop?.primaryDomain?.locale || 'en';
  } catch (error) {
    console.error('❌ Error while retrieving shop language:', error);
    return 'en';
  }
}

/**
 * Retrieves metaobject definitions to get information about fields
 * @param adminUrl Shopify admin API URL
 * @param token Authentication token
 * @returns Object containing metaobject definitions
 */
export async function getMetaobjectDefinitions(adminUrl: string, token: string) {
  try {
    // Retrieve the shop's language
    const locale = await getShopLanguage(adminUrl, token);
    console.log('🌍 Shop language:', locale);

    // Query with localization support
    const query = `
      query {
        metaobjectDefinitions(first: 50) {
          edges {
            node {
              id
              name
              type
              fieldDefinitions {
                key
                name
                description
                type {
                  name
                }
                validations {
                  name
                  value
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
        'Accept-Language': locale, // Add language header
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error('❌ HTTP error:', response.status, response.statusText);
      return {};
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ GraphQL error:', data.errors);
      return {};
    }

    const definitions: { [key: string]: any } = {};
    if (data.data?.metaobjectDefinitions?.edges) {
      data.data.metaobjectDefinitions.edges.forEach((edge: any) => {
        const definition = edge.node;
        definitions[definition.type] = {
          id: definition.id,
          name: definition.name,
          type: definition.type,
          fields: definition.fieldDefinitions.reduce((acc: any, field: any) => {
            acc[field.key] = {
              key: field.key,
              name: field.name,
              description: field.description,
              type: field.type?.name || field.type,
              validations: field.validations
            };
            return acc;
          }, {})
        };
      });
    }

    console.log('✅ Metaobject definitions retrieved:', Object.keys(definitions));
    return definitions;
  } catch (error) {
    console.error('❌ Error while retrieving metaobject definitions:', error);
    return {};
  }
}

/**
 * Enriches meta fields with information from definitions
 * @param categoryMetaFields The category meta fields
 * @param metaobjectDefinitions The metaobject definitions
 * @returns The meta fields enriched with definition information
 */
export function enrichMetaFieldsWithDefinitions(categoryMetaFields: any[], metaobjectDefinitions: any) {
  return categoryMetaFields.map(field => {
    // Look for the corresponding definition
    const definition = metaobjectDefinitions[field.key];
    
    return {
      ...field,
      field_definition: definition ? {
        name: definition.name,
        description: definition.fields?.value?.description || null,
        field_type: definition.fields?.value?.type || null
      } : {
        name: field.key.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        description: null,
        field_type: field.type
      },
      // Add information about possible values if available
      possible_values: definition?.fields?.value?.validations || null
    };
  });
} 