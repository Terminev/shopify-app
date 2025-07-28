import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("==> /upsellr/products-import called");
  if (request.method !== "POST") {
    console.log("Mauvaise méthode :", request.method);
    return json({ success: false, error: "Méthode non autorisée. Utilisez POST." }, { status: 405 });
  }

  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json({ success: false, error: shopifyAuth.error.message }, { status: shopifyAuth.error.status });
  }
  
  const { token, shopDomain, adminUrl } = shopifyAuth;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ success: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (!body.products || !Array.isArray(body.products)) {
    return json({ success: false, error: "Le body doit contenir un tableau 'products'" }, { status: 400 });
  }

  const results = [];
  for (const prod of body.products) {
    if (!prod.title && !prod.id) continue;

    const upsellrRawId = prod.upsellr_raw_id ?? null;

    const input: any = {
      title: prod.title,
    };
    if (prod.description) input.descriptionHtml = prod.description;
    if (prod.status) input.status = prod.status;
    if (prod.vendor) input.vendor = prod.vendor;
    if (prod.productType) input.productType = prod.productType;
    if (prod.tags) input.tags = Array.isArray(prod.tags) ? prod.tags : [prod.tags];
    if (prod.meta_title) input.seo = { ...input.seo, title: prod.meta_title };
    if (prod.meta_description) input.seo = { ...input.seo, description: prod.meta_description };
    
    // Gestion de la short_description via metafield
    if (prod.short_description) {
      if (!input.metafields) input.metafields = [];
      input.metafields.push({
        namespace: "custom",
        key: "short_description",
        value: prod.short_description,
        type: "single_line_text_field"
      });
    }
    
    if (prod.id) input.id = prod.id;

    let mutation;
    let variables;
    let createdProduct = null;
    let creationErrors = [];

    if (prod.id) {
      // Update existing product
      mutation = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { 
              id 
              title 
              descriptionHtml
              seo {
                title
                description
              }
              metafield(namespace: "custom", key: "short_description") {
                value
              }
            }
            userErrors { field message }
          }
        }
      `;
      variables = { input };
    } else {
      // Create new product
      mutation = `
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product { 
              id 
              title 
              descriptionHtml
              seo {
                title
                description
              }
              metafield(namespace: "custom", key: "short_description") {
                value
              }
            }
            userErrors { field message }
          }
        }
      `;
      variables = { input };
    }

    const resp = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const data = await resp.json();
    if (prod.id) {
      createdProduct = data.data?.productUpdate?.product;
      creationErrors = data.data?.productUpdate?.userErrors || [];
    } else {
      createdProduct = data.data?.productCreate?.product;
      creationErrors = data.data?.productCreate?.userErrors || [];
    }

    // === AJOUT/UPDATE DES VARIANTES (SKU/BARCODE) ===
    if (createdProduct && prod.variants && prod.variants.length) {
      // 1. Récupérer les variants existants du produit
      const getVariantsQuery = `
        query GetProductVariants($id: ID!) {
          product(id: $id) {
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                }
              }
            }
          }
        }
      `;

      const getVariantsResp = await fetch(adminUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({
          query: getVariantsQuery,
          variables: { id: createdProduct.id }
        }),
      });

      const getVariantsData = await getVariantsResp.json();
      const existingVariants = getVariantsData.data?.product?.variants?.edges || [];

      // 2. Préparer les variants pour la mise à jour
      const variantsInput = prod.variants.map((variantUpdate: any, index: number) => {
        const v: any = {};
        
        // Si on a un ID spécifique dans la requête, l'utiliser
        if (variantUpdate.id) {
          v.id = variantUpdate.id;
        } 
        // Sinon, utiliser le variant existant correspondant à l'index
        else if (existingVariants[index]) {
          v.id = existingVariants[index].node.id;
        }
        
        // Ajouter les champs à mettre à jour
        if (variantUpdate.sku !== undefined) v.sku = variantUpdate.sku;
        if (variantUpdate.barcode !== undefined) v.barcode = variantUpdate.barcode;
        if (variantUpdate.price !== undefined) v.price = variantUpdate.price;
        
        return v;
      }).filter((v: any) => v.id); // Ne garder que les variants avec un ID

      if (variantsInput.length > 0) {
        const variantMutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants {
                id
                sku
                barcode
                price
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variantResp = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
          },
          body: JSON.stringify({
            query: variantMutation,
            variables: {
              productId: createdProduct.id,
              variants: variantsInput
            }
          }),
        });

        const variantData = await variantResp.json();
        if (variantData.data?.productVariantsBulkUpdate?.userErrors?.length) {
          console.log("Erreurs lors de la mise à jour des variants:", variantData.data.productVariantsBulkUpdate.userErrors);
        }
      }
    }

    // Suppression des images existantes si update
    if (prod.id && createdProduct) {
      const getMediaQuery = `
        query getProductMedia($id: ID!) {
          product(id: $id) {
            media(first: 100) {
              edges {
                node {
                  ... on MediaImage {
                    id
                  }
                }
              }
            }
          }
        }
      `;
      const getMediaResp = await fetch(adminUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query: getMediaQuery, variables: { id: createdProduct.id } }),
      });
      const getMediaData = await getMediaResp.json();
      const mediaEdges = getMediaData.data?.product?.media?.edges || [];
      const mediaIds = mediaEdges.map((edge: any) => edge.node?.id).filter(Boolean);
      if (mediaIds.length > 0) {
        const deleteMediaMutation = `
          mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
            productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
              deletedMediaIds
              userErrors { field message }
            }
          }
        `;
        await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
          },
          body: JSON.stringify({ query: deleteMediaMutation, variables: { productId: createdProduct.id, mediaIds } }),
        });
      }
    }

    // Ajout des images séparément
    let imageErrors = [];
    let appendedImages = [];
    if (createdProduct && prod.images?.length) {
      const imageMutation = `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage {
                id
                image {
                  id
                  originalSrc
                }
              }
            }
            mediaUserErrors {
              field
              message
            }
          }
        }
      `;

      const imageVariables = {
        productId: createdProduct.id,
        media: prod.images.map((src: any) => ({
          originalSource: src,
          mediaContentType: "IMAGE"
        })),
      };

      const imageResp = await fetch(adminUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query: imageMutation, variables: imageVariables }),
      });

      const imageData = await imageResp.json();

      appendedImages = imageData.data?.productCreateMedia?.media || [];
      imageErrors = imageData.data?.productCreateMedia?.mediaUserErrors || [];
    }

    // Ajout aux collections
    let collectionErrors = [];
    if (createdProduct) {
      // Si update, retirer le produit de toutes les collections existantes avant d'ajouter les nouvelles (ou rien si prod.collections vide)
      if (prod.id) {
        const getCollectionsQuery = `
          query getProductCollections($id: ID!) {
            product(id: $id) {
              collections(first: 100) {
                edges { node { id } }
              }
            }
          }
        `;
        const getCollectionsResp = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
          },
          body: JSON.stringify({ query: getCollectionsQuery, variables: { id: createdProduct.id } }),
        });
        const getCollectionsData = await getCollectionsResp.json();
        const currentCollections = getCollectionsData.data?.product?.collections?.edges?.map((edge: any) => edge.node.id) || [];
        for (const collectionId of currentCollections) {
          const removeFromCollectionMutation = `
            mutation removeProductFromCollection($id: ID!, $productIds: [ID!]!) {
              collectionRemoveProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }
          `;
          const removeResp = await fetch(adminUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': token,
            },
            body: JSON.stringify({
              query: removeFromCollectionMutation,
              variables: { id: collectionId, productIds: [createdProduct.id] },
            }),
          });
          const removeData = await removeResp.json();
          if (removeData.errors || removeData.data?.collectionRemoveProducts?.userErrors?.length) {
            collectionErrors.push({
              collectionId,
              errors: removeData.errors,
              userErrors: removeData.data?.collectionRemoveProducts?.userErrors
            });
          }
        }
      }
      // Ajout aux nouvelles collections
      if (prod.collections && prod.collections.length) {
        for (const collectionId of prod.collections) {
          const addToCollectionMutation = `
            mutation addProductToCollection($id: ID!, $productIds: [ID!]!) {
              collectionAddProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }
          `;
          const collectionResp = await fetch(adminUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': token,
            },
            body: JSON.stringify({
              query: addToCollectionMutation,
              variables: { id: collectionId, productIds: [createdProduct.id] },
            }),
          });

          const collectionData = await collectionResp.json();
          if (collectionData.errors || collectionData.data?.collectionAddProducts?.userErrors?.length) {
            collectionErrors.push({
              collectionId,
              errors: collectionData.errors,
              userErrors: collectionData.data?.collectionAddProducts?.userErrors
            });
          }
        }
      }
    }

    let status = "ok";
    let error = null;
    let shopifyId = createdProduct?.id || null;
    let metaTitle = createdProduct?.seo?.title || null;
    let metaDescription = createdProduct?.seo?.description || null;
    let shortDescription = createdProduct?.metafield?.value || null;
    
    if (creationErrors && creationErrors.length) {
      status = "error";
      error = creationErrors.map((e: any) => e.message).join(", ");
    }

    results.push({
      status,
      error,
      shopify_id: shopifyId,
      upsellr_raw_id: upsellrRawId,
      meta_title: metaTitle,
      meta_description: metaDescription,
      short_description: shortDescription
    });
  }

  return json({
    results
  });
};