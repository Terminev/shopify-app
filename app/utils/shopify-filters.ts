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
      console.error("Réponse Shopify brute:", JSON.stringify(productsData, null, 2));
      // Fallback automatique : si on n'a pas déjà essayé sans references, on réessaie sans ce champ
      if (!triedWithoutReferences && allProductFields) {
        triedWithoutReferences = true;
        // On retire 'references' de la requête
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
        // On relance la boucle sans avancer le curseur
        continue;
      }
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

/**
 * Récupère les meta taxonomies attribuées automatiquement selon la catégorie
 * @param products Liste des produits avec leurs métadonnées
 * @returns Objet contenant les meta taxonomies par catégorie
 */
export function extractCategoryMetaTaxonomies(products: any[]) {
  const categoryMetaTaxonomies: { [categoryName: string]: any[] } = {};
  
  products.forEach((product) => {
    const categoryName = product.category?.name;
    if (!categoryName) return;
    
    // Récupérer les métadonnées du produit
    const metafields = product.metafields?.edges?.map((edge: any) => edge.node) || [];
    
    // Filtrer les métadonnées qui semblent être des taxonomies automatiques
    const taxonomyMetafields = metafields.filter((metafield: any) => {
      // Chercher les métadonnées qui pourraient être des taxonomies automatiques
      // Ces métadonnées sont souvent dans des namespaces spécifiques ou ont des clés particulières
      const key = metafield.key?.toLowerCase() || '';
      const namespace = metafield.namespace?.toLowerCase() || '';
      
      // Patterns pour identifier les taxonomies automatiques
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
      ) || namespace === 'specs'; // Le namespace specs contient souvent les spécifications techniques
    });
    
    if (taxonomyMetafields.length > 0) {
      if (!categoryMetaTaxonomies[categoryName]) {
        categoryMetaTaxonomies[categoryName] = [];
      }
      
      // Ajouter les métadonnées de taxonomie pour cette catégorie
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
 * Récupère les suggestions de meta taxonomies pour une catégorie spécifique
 * @param products Liste des produits
 * @param categoryName Nom de la catégorie
 * @returns Liste des suggestions de métadonnées pour cette catégorie
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
  
  // Convertir les Sets en Arrays et trier par fréquence
  return Object.values(suggestions)
    .map(suggestion => ({
      ...suggestion,
      values: Array.from(suggestion.values),
      frequency: suggestion.count / categoryProducts.length
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

/**
 * Résout les références de metaobjects pour obtenir les labels
 * @param metafield Metafield avec ses références
 * @param adminUrl URL de l'API admin Shopify
 * @param token Token d'authentification
 * @returns Valeur avec les labels résolus
 */
async function resolveMetaobjectReferences(metafield: any, adminUrl?: string, token?: string): Promise<any> {
  // Si pas de références dans la réponse, essayer de récupérer les metaobjects séparément
  if (!metafield.references?.edges?.length && (metafield.type === 'list.metaobject_reference' || metafield.type === 'metaobject_reference')) {
    if (!adminUrl || !token) {
      console.log(`⚠️ Pas de contexte pour résoudre les metaobjects: ${metafield.key}`);
      return metafield.value; // Pas possible de résoudre sans contexte
    }

    try {
      // Parser la valeur pour extraire les IDs
      let metaobjectIds: string[] = [];
      if (metafield.type === 'list.metaobject_reference') {
        try {
          metaobjectIds = JSON.parse(metafield.value);
        } catch (e) {
          console.log(`❌ Erreur parsing JSON pour ${metafield.key}:`, e);
          return metafield.value;
        }
      } else {
        metaobjectIds = [metafield.value];
      }

      console.log(`🔍 Tentative de résolution de ${metaobjectIds.length} metaobject(s) pour ${metafield.key}:`, metaobjectIds);

      // Récupérer les metaobjects un par un
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

        console.log(`📡 Requête metaobject pour ${metaobjectId}`);
        
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
        console.log(`📥 Réponse metaobject pour ${metaobjectId}:`, JSON.stringify(metaobjectData, null, 2));

        if (metaobjectData.data?.metaobject) {
          const metaobject = metaobjectData.data.metaobject;
          console.log(`✅ Metaobject trouvé:`, metaobject);
          
          const titleField = metaobject.fields.find((field: any) => 
            field.key === 'title' || field.key === 'name' || field.key === 'label'
          );
          
          const label = titleField?.value || metaobject.type;
          console.log(`🏷️ Label trouvé: "${label}" (champ: ${titleField?.key || 'type'})`);
          
          resolvedReferences.push({
            id: metaobjectId,
            label: label,
            type: metaobject.type
          });
        } else if (metaobjectData.errors) {
          console.error(`❌ Erreur GraphQL pour ${metaobjectId}:`, metaobjectData.errors);
          resolvedReferences.push({
            id: metaobjectId,
            label: 'Error: ' + metaobjectData.errors[0]?.message || 'Unknown',
            type: 'error'
          });
        } else {
          console.log(`❓ Metaobject non trouvé pour ${metaobjectId}`);
          resolvedReferences.push({
            id: metaobjectId,
            label: 'Unknown',
            type: 'unknown'
          });
        }
      }

      return metafield.type === 'list.metaobject_reference' ? resolvedReferences : resolvedReferences[0];
    } catch (error) {
      console.error('❌ Erreur lors de la résolution des metaobjects:', error);
      return metafield.value;
    }
  }

  // Si on a des références dans la réponse
  if (metafield.references?.edges?.length) {
    const references = metafield.references.edges.map((edge: any) => edge.node);
    
    // Si c'est un tableau de références (comme dans les métadonnées JSON)
    if (metafield.type === 'list.metaobject_reference' || metafield.type === 'json') {
      try {
        // Essayer de parser la valeur comme JSON
        const valueArray = JSON.parse(metafield.value);
        if (Array.isArray(valueArray)) {
          return valueArray.map((refId: string) => {
            const reference = references.find((ref: any) => ref.id === refId);
            if (reference) {
              // Chercher le champ 'title' ou 'name' ou le premier champ disponible
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
        // Si ce n'est pas du JSON, traiter comme une référence simple
      }
    }

    // Pour les références simples
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
 * Récupère les meta taxonomies d'un produit spécifique avec les labels résolus
 * @param product Produit avec ses métadonnées
 * @param adminUrl URL de l'API admin Shopify (optionnel, pour résoudre les metaobjects)
 * @param token Token d'authentification (optionnel, pour résoudre les metaobjects)
* @returns Objet contenant les meta taxonomies du produit
*/
export async function getProductMetaTaxonomies(product: any, adminUrl?: string, token?: string, skipMetaobjectResolution?: boolean) {
  const metafields = product.metafields?.edges?.map((edge: any) => edge.node) || [];
  const taxonomies: { [key: string]: any } = {};
  
  for (const metafield of metafields) {
    const key = `${metafield.namespace || 'undefined'}.${metafield.key}`;
    
    // Résoudre les références de metaobjects (async maintenant)
    const resolvedValue = skipMetaobjectResolution ? metafield.value : await resolveMetaobjectReferences(metafield, adminUrl, token);
    
    taxonomies[key] = {
      namespace: metafield.namespace,
      key: metafield.key,
      value: resolvedValue,
      type: metafield.type,
      original_value: metafield.value // Garder la valeur originale pour référence
    };
  }
  
  return taxonomies;
} 

/**
 * Récupère les définitions des metaobject definitions pour obtenir les informations sur les champs
 * @param adminUrl URL de l'API admin Shopify
 * @param token Token d'authentification
 * @returns Objet contenant les définitions des metaobject definitions
 */
export async function getMetaobjectDefinitions(adminUrl: string, token: string) {
  try {
    // Requête corrigée avec les sélections pour le champ type
    const query = `
      query {
        metaobjectDefinitions(first: 10) {
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
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error('❌ Erreur HTTP:', response.status, response.statusText);
      return {};
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ Erreur GraphQL:', data.errors);
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

    console.log('✅ Metaobject definitions récupérées:', Object.keys(definitions));
    console.log('📋 Détails des définitions:', JSON.stringify(definitions, null, 2));

    return definitions;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des metaobject definitions:', error);
    return {};
  }
}

/**
 * Enrichit les meta fields avec les informations des définitions
 * @param categoryMetaFields Les meta fields de catégorie
 * @param metaobjectDefinitions Les définitions des metaobject definitions
 * @returns Les meta fields enrichis avec les informations des définitions
 */
export function enrichMetaFieldsWithDefinitions(categoryMetaFields: any[], metaobjectDefinitions: any) {
  return categoryMetaFields.map(field => {
    // Chercher la définition correspondante
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
      // Ajouter les informations sur les valeurs possibles si disponibles
      possible_values: definition?.fields?.value?.validations || null
    };
  });
} 