import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

// Fonction pour vérifier si une image est accessible
async function checkImageAccessibility(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.log(`❌ Image inaccessible: ${imageUrl}`);
    return false;
  }
}

// Fonction pour filtrer les images accessibles
async function filterAccessibleImages(images: string[]): Promise<string[]> {
  console.log(`🔍 Vérification de l'accessibilité de ${images.length} images...`);
  
  const accessibleImages: string[] = [];
  const inaccessibleImages: string[] = [];
  
  // Vérifier chaque image en parallèle pour plus de performance
  const imageChecks = await Promise.allSettled(
    images.map(async (imageUrl) => {
      const isAccessible = await checkImageAccessibility(imageUrl);
      return { imageUrl, isAccessible };
    })
  );
  
  for (const result of imageChecks) {
    if (result.status === 'fulfilled') {
      const { imageUrl, isAccessible } = result.value;
      if (isAccessible) {
        accessibleImages.push(imageUrl);
      } else {
        inaccessibleImages.push(imageUrl);
      }
    } else {
      // En cas d'erreur, considérer l'image comme inaccessible
      console.log(`❌ Erreur lors de la vérification d'une image`);
    }
  }
  
  if (inaccessibleImages.length > 0) {
    console.log(`⚠️ ${inaccessibleImages.length} image(s) inaccessible(s) filtrée(s):`, inaccessibleImages);
  }
  
  console.log(`✅ ${accessibleImages.length} image(s) accessible(s) conservée(s)`);
  return accessibleImages;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("==> /upsellr/products-import called");

  if (request.method !== "POST") {
    console.log("❌ Mauvaise méthode :", request.method);
    return json(
      { success: false, error: "Méthode non autorisée. Utilisez POST." },
      { status: 405 },
    );
  }

  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    console.error(
      "❌ Erreur authentification Shopify :",
      shopifyAuth.error.message,
    );
    return json(
      { success: false, error: shopifyAuth.error.message },
      { status: shopifyAuth.error.status },
    );
  }

  const { token, adminUrl } = shopifyAuth;

  let body: any;
  try {
    body = await request.json();
  } catch (err) {
    console.error("❌ Body JSON invalide");
    return json(
      { success: false, error: "Body JSON invalide" },
      { status: 400 },
    );
  }

  if (!body.products || !Array.isArray(body.products)) {
    console.error("❌ Le body ne contient pas un tableau products valide");
    return json(
      { success: false, error: "Le body doit contenir un tableau 'products'" },
      { status: 400 },
    );
  }

  const results: any[] = [];
  for (const prod of body.products) {
    if (!prod.title && !prod.id) continue;

    console.log("==> Traitement produit :", prod.title || prod.id);

    const upsellrRawId = prod.upsellr_raw_id ?? null;

    const input: any = { title: prod.title };
    if (prod.description) input.descriptionHtml = prod.description;
    if (prod.status) input.status = prod.status;
    if (prod.vendor) input.vendor = prod.vendor;
    if (prod.productType) input.productType = prod.productType;
    if (prod.tags)
      input.tags = Array.isArray(prod.tags) ? prod.tags : [prod.tags];
    if (prod.meta_title) input.seo = { ...input.seo, title: prod.meta_title };
    if (prod.meta_description)
      input.seo = { ...input.seo, description: prod.meta_description };

    if (prod.short_description) {
      if (!input.metafields) input.metafields = [];
      input.metafields.push({
        namespace: "custom",
        key: "short_description",
        value: prod.short_description,
        type: "string",
      });
    }
    if (prod.id) input.id = prod.id;

    let mutation: string;
    let variables: any;
    if (prod.id) {
      mutation = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `;
    } else {
      mutation = `
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `;
    }
    variables = { input };

    // --- Création ou update du produit ---
    console.log("📡 Envoi mutation productCreate/productUpdate");
    const resp = await fetch(adminUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const data = await resp.json();
    console.log("📥 Réponse produit :", JSON.stringify(data, null, 2));

    const createdProduct = prod.id
      ? data.data?.productUpdate?.product
      : data.data?.productCreate?.product;

    const creationErrors = prod.id
      ? data.data?.productUpdate?.userErrors || []
      : data.data?.productCreate?.userErrors || [];

    if (!createdProduct?.id) {
      console.error("❌ Aucun produit retourné par Shopify");
      results.push({ status: "error", error: creationErrors });
      continue;
    }
    console.log("✅ Produit créé/mis à jour :", createdProduct.id);

    // --- MAJ SKU / Barcode ---
    if (prod.sku || prod.ean || (prod.variants && prod.variants.length > 0)) {
      console.log("==> Début mise à jour SKU/EAN pour :", createdProduct.id);

      try {
        const getVariantsQuery = `
      query getProductVariants($id: ID!) {
        product(id: $id) {
          variants(first: 50) {
            edges {
              node { id title sku barcode }
            }
          }
        }
      }
    `;
        console.log("📡 Fetch variants pour :", createdProduct.id);
        const variantsResp = await fetch(adminUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({
            query: getVariantsQuery,
            variables: { id: createdProduct.id },
          }),
        });
        const variantsData = await variantsResp.json();
        console.log(
          "📥 Variants data :",
          JSON.stringify(variantsData, null, 2),
        );

        const variants = variantsData.data?.product?.variants?.edges || [];
        if (!variants.length) {
          console.error("⚠️ Aucune variante trouvée → impossible MAJ SKU/EAN");
        } else {
          console.log(`✅ ${variants.length} variante(s) trouvée(s)`);

          // Utiliser l'API REST pour mettre à jour les variantes (plus fiable pour sku/barcode)
          for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            let sku = variant.node.sku;
            let barcode = variant.node.barcode;

            if (prod.variants && prod.variants.length > i) {
              if (prod.variants[i].sku) sku = prod.variants[i].sku;
              if (prod.variants[i].ean) barcode = prod.variants[i].ean; // Utiliser 'ean' du body
            } else {
              if (prod.sku) sku = prod.sku;
              if (prod.ean) barcode = prod.ean; // Utiliser 'ean' du body
            }

            // Extraire l'ID de la variante de l'URL GraphQL
            const variantId = variant.node.id.split("/").pop();
            const restUrl = `https://${shopifyAuth.shopDomain}/admin/api/2024-01/variants/${variantId}.json`;

            const variantData = {
              variant: {
                id: variantId,
                sku: sku || null,
                barcode: barcode || null, // Utiliser 'barcode' pour Shopify
              },
            };

            console.log(
              `📤 REST Update variante ${i + 1}:`,
              JSON.stringify(variantData, null, 2),
            );

            const restResp = await fetch(restUrl, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": token,
              },
              body: JSON.stringify(variantData),
            });

            const restData = await restResp.json();
            console.log(
              `📥 Résultat REST variante ${i + 1}:`,
              JSON.stringify(restData, null, 2),
            );

            if (restResp.ok) {
              console.log(`✅ Variante ${i + 1} mise à jour via REST API !`);
            } else {
              console.error(
                `❌ Erreur REST variante ${i + 1}:`,
                JSON.stringify(restData, null, 2),
              );
            }
          }
        }
      } catch (err) {
        console.error("💥 Erreur MAJ SKU/EAN :", err);
      }
    }

    /* --- MAJ des images --- */

    // Suppression des images existantes si update
    if (prod.id && createdProduct) {
      console.log("🖼️ Début traitement images - Suppression images existantes");
      
      // 1. Récupérer les media (images) existants du produit
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
      console.log("📡 Récupération media existants pour:", createdProduct.id);
      const getMediaResp = await fetch(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: getMediaQuery,
          variables: { id: createdProduct.id },
        }),
      });
      const getMediaData = await getMediaResp.json();
      console.log("📥 Media existants:", JSON.stringify(getMediaData, null, 2));
      
      const mediaEdges = getMediaData.data?.product?.media?.edges || [];
      const mediaIds = mediaEdges
        .map((edge: any) => edge.node?.id)
        .filter(Boolean);
      console.log(`🗑️ Suppression de ${mediaIds.length} media existants:`, mediaIds);
      
      if (mediaIds.length > 0) {
        const deleteMediaMutation = `
          mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
            productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
              deletedMediaIds
              userErrors { field message }
            }
          }
        `;
        const deleteMediaResp = await fetch(adminUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({
            query: deleteMediaMutation,
            variables: { productId: createdProduct.id, mediaIds },
          }),
        });
        const deleteMediaData = await deleteMediaResp.json();
        console.log("🗑️ Résultat suppression media:", JSON.stringify(deleteMediaData, null, 2));
      }
    }

    // Étape 2 : Ajout des images séparément
    if (createdProduct && prod.images?.length) {
      console.log(`🖼️ Vérification et ajout de ${prod.images.length} images`);
      console.log("📋 Images à vérifier:", prod.images);
      
      // Filtrer les images accessibles
      const accessibleImages = await filterAccessibleImages(prod.images);
      
      if (accessibleImages.length === 0) {
        console.log("⚠️ Aucune image accessible trouvée - passage à l'étape suivante");
      } else {
        console.log(`✅ ${accessibleImages.length} image(s) accessible(s) à ajouter`);
        
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
          media: accessibleImages.map((src: string) => ({
            originalSource: src,
            mediaContentType: "IMAGE",
          })),
        };
      
      console.log("📤 Variables création media:", JSON.stringify(imageVariables, null, 2));

      const createMediaResp = await fetch(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: imageMutation,
          variables: imageVariables,
        }),
      });
      
      const createMediaData = await createMediaResp.json();
      console.log("📥 Résultat création media:", JSON.stringify(createMediaData, null, 2));
      
      if (createMediaData.errors) {
        console.error("❌ Erreurs création media:", JSON.stringify(createMediaData.errors, null, 2));
      }
      
      const mediaUserErrors = createMediaData.data?.productCreateMedia?.mediaUserErrors || [];
      if (mediaUserErrors.length > 0) {
        console.error("⚠️ Erreurs utilisateur création media:", JSON.stringify(mediaUserErrors, null, 2));
        } else {
          console.log("✅ Media créés avec succès");
        }
      }
    }

    // Ajout aux collections
    let collectionErrors: any[] = [];
    if (createdProduct) {
      console.log("📚 Début traitement collections");
      
      // Si update, retirer le produit de toutes les collections existantes avant d'ajouter les nouvelles (ou rien si prod.collections vide)
      if (prod.id) {
        console.log("🔄 Mode UPDATE - Suppression des collections existantes");
        
        // 1. Récupérer toutes les collections du produit
        const getCollectionsQuery = `
          query getProductCollections($id: ID!) {
            product(id: $id) {
              collections(first: 100) {
                edges { node { id } }
              }
            }
          }
        `;
        console.log("📡 Récupération collections existantes");
        const getCollectionsResp = await fetch(adminUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({
            query: getCollectionsQuery,
            variables: { id: createdProduct.id },
          }),
        });
        const getCollectionsData = await getCollectionsResp.json();
        console.log("📥 Collections existantes:", JSON.stringify(getCollectionsData, null, 2));
        
        const currentCollections =
          getCollectionsData.data?.product?.collections?.edges?.map(
            (edge: any) => edge.node.id,
          ) || [];
        console.log(`🗑️ Suppression de ${currentCollections.length} collections:`, currentCollections);
        
        // 2. Retirer le produit de chaque collection
        for (const collectionId of currentCollections) {
          console.log(`🗑️ Suppression du produit de la collection: ${collectionId}`);
          const removeFromCollectionMutation = `
            mutation removeProductFromCollection($id: ID!, $productIds: [ID!]!) {
              collectionRemoveProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }
          `;
          const removeResp = await fetch(adminUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify({
              query: removeFromCollectionMutation,
              variables: { id: collectionId, productIds: [createdProduct.id] },
            }),
          });
          const removeData = await removeResp.json();
          console.log(`📥 Résultat suppression collection ${collectionId}:`, JSON.stringify(removeData, null, 2));
          
          if (
            removeData.errors ||
            removeData.data?.collectionRemoveProducts?.userErrors?.length
          ) {
            console.error(`❌ Erreur suppression collection ${collectionId}:`, JSON.stringify(removeData, null, 2));
            collectionErrors.push({
              collectionId,
              errors: removeData.errors,
              userErrors: removeData.data?.collectionRemoveProducts?.userErrors,
            });
          }
        }
      }
      // Ajout aux nouvelles collections (logique existante)
      if (prod.collections && prod.collections.length) {
        console.log(`📚 Ajout aux ${prod.collections.length} nouvelles collections:`, prod.collections);
        
        for (const collectionId of prod.collections) {
          console.log(`➕ Ajout du produit à la collection: ${collectionId}`);
          const addToCollectionMutation = `
            mutation addProductToCollection($id: ID!, $productIds: [ID!]!) {
              collectionAddProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }
          `;
          const collectionResp = await fetch(adminUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify({
              query: addToCollectionMutation,
              variables: { id: collectionId, productIds: [createdProduct.id] },
            }),
          });

          const collectionData = await collectionResp.json();
          console.log(`📥 Résultat ajout collection ${collectionId}:`, JSON.stringify(collectionData, null, 2));
          
          if (
            collectionData.errors ||
            collectionData.data?.collectionAddProducts?.userErrors?.length
          ) {
            console.error(`❌ Erreur ajout collection ${collectionId}:`, JSON.stringify(collectionData, null, 2));
            collectionErrors.push({
              collectionId,
              errors: collectionData.errors,
              userErrors:
                collectionData.data?.collectionAddProducts?.userErrors,
            });
          } else {
            console.log(`✅ Produit ajouté avec succès à la collection ${collectionId}`);
          }
        }
      } else {
        console.log("ℹ️ Aucune collection à ajouter");
      }
    }

    results.push({
      status: creationErrors.length ? "error" : "ok",
      error: creationErrors.map((e: any) => e.message).join(", ") || null,
      shopify_id: createdProduct.id,
      upsellr_raw_id: upsellrRawId,
    });
  }

  return json({ results });
};
