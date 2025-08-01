import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

// Fonction pour vérifier si une image est accessible
async function checkImageAccessibility(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, {
      method: "HEAD",
      // Ajouter un timeout pour éviter les blocages
      signal: AbortSignal.timeout(10000), // 10 secondes de timeout
    });

    if (!response.ok) {
      console.log(`❌ Image inaccessible (${response.status}): ${imageUrl}`);
      return false;
    }

    // Vérifier que c'est bien une image
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
      console.log(
        `❌ URL ne pointe pas vers une image (${contentType}): ${imageUrl}`,
      );
      return false;
    }

    // Vérifier la taille du contenu si disponible
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) === 0) {
      console.log(`❌ Image vide (0 bytes): ${imageUrl}`);
      return false;
    }

    // Vérification spéciale pour les images Shopify
    if (imageUrl.includes("cdn.shopify.com")) {
      // Pour les images Shopify, faire une vérification plus poussée
      try {
        const fullResponse = await fetch(imageUrl, {
          method: "GET",
          signal: AbortSignal.timeout(15000), // 15 secondes pour le téléchargement complet
        });

        if (!fullResponse.ok) {
          console.log(
            `❌ Image Shopify inaccessible (${fullResponse.status}): ${imageUrl}`,
          );
          return false;
        }

        const buffer = await fullResponse.arrayBuffer();
        if (buffer.byteLength === 0) {
          console.log(`❌ Image Shopify vide (0 bytes): ${imageUrl}`);
          return false;
        }

        console.log(
          `✅ Image Shopify accessible (${buffer.byteLength} bytes): ${imageUrl}`,
        );
        return true;
      } catch (shopifyError) {
        console.log(
          `❌ Erreur lors de la vérification complète de l'image Shopify ${imageUrl}:`,
          shopifyError,
        );
        return false;
      }
    }

    console.log(`✅ Image accessible (${contentType}): ${imageUrl}`);
    return true;
  } catch (error) {
    console.log(
      `❌ Erreur lors de la vérification de l'image ${imageUrl}:`,
      error,
    );
    return false;
  }
}

// Fonction pour filtrer les images accessibles
async function filterAccessibleImages(images: string[]): Promise<string[]> {
  console.log(
    `🔍 Vérification de l'accessibilité de ${images.length} images...`,
  );

  const accessibleImages: string[] = [];
  const inaccessibleImages: string[] = [];

  // Vérifier chaque image en parallèle pour plus de performance
  const imageChecks = await Promise.allSettled(
    images.map(async (imageUrl) => {
      const isAccessible = await checkImageAccessibility(imageUrl);
      return { imageUrl, isAccessible };
    }),
  );

  for (const result of imageChecks) {
    if (result.status === "fulfilled") {
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
    console.log(
      `⚠️ ${inaccessibleImages.length} image(s) inaccessible(s) filtrée(s):`,
      inaccessibleImages,
    );
  }

  console.log(
    `✅ ${accessibleImages.length} image(s) accessible(s) conservée(s)`,
  );
  return accessibleImages;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
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

    const upsellrRawId = prod.upsellr_raw_id ?? null;

    const input: any = { title: prod.title };
    if (prod.description) input.descriptionHtml = prod.description;
    
    // Logique du statut : UPDATE = garder le statut actuel, CREATE = PENDING par défaut
    if (prod.id) {
      // UPDATE : ne pas modifier le statut, laisser celui actuellement défini par l'utilisateur
      console.log(`🔄 UPDATE - Statut non modifié (gardé tel quel par l'utilisateur)`);
    } else {
      // CREATE : statut par défaut PENDING
      input.status = "DRAFT";
      console.log(`📝 CREATE - Statut défini à PENDING par défaut`);
    }
    
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
        type: "multi_line_text_field",
      });
    }

    // Gestion des spécifications techniques
    if (
      prod.specifications &&
      Array.isArray(prod.specifications) &&
      prod.specifications.length > 0
    ) {
      if (!input.metafields) input.metafields = [];

      const specsArray = prod.specifications.map((spec: any) => ({
        title: spec.name,
        value: spec.content,
      }));

      input.metafields.push({
        namespace: "specs",
        key: "technical",
        value: JSON.stringify(specsArray),
        type: "json",
      });
    }
    if (prod.id) input.id = prod.id;

    let mutation: string;
    let variables: any;
    
    if (prod.id) {
      // Essayer d'abord UPDATE
      mutation = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `;
    } else {
      // CREATE direct
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
    const resp = await fetch(adminUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const data = await resp.json();

    let createdProduct = prod.id
      ? data.data?.productUpdate?.product
      : data.data?.productCreate?.product;

    let creationErrors = prod.id
      ? data.data?.productUpdate?.userErrors || []
      : data.data?.productCreate?.userErrors || [];

    // Si UPDATE échoue (produit supprimé), essayer CREATE
    if (!createdProduct?.id && prod.id && creationErrors.length > 0) {
      console.log(`⚠️ UPDATE échoué pour ${prod.id} - Tentative de CREATE à la place`);
      console.log(`📋 Erreurs détectées:`, JSON.stringify(creationErrors, null, 2));
      
      // Vérifier si l'erreur indique que le produit n'existe pas
      const productNotFound = creationErrors.some((error: any) => {
        const message = error.message?.toLowerCase() || '';
        return message.includes("not found") || 
               message.includes("doesn't exist") ||
               message.includes("product not found") ||
               message.includes("could not find") ||
               message.includes("invalid id") ||
               message.includes("does not exist");
      });
      
      console.log(`🔍 Détection erreur "produit non trouvé": ${productNotFound}`);
      
      if (productNotFound) {
        console.log(`🔄 Produit ${prod.id} supprimé côté Shopify - Création d'un nouveau produit`);
        
        // Retirer l'ID pour faire un CREATE
        delete input.id;
        input.status = "DRAFT"; // Statut par défaut pour nouveau produit
        
        const createMutation = `
          mutation productCreate($input: ProductInput!) {
            productCreate(input: $input) {
              product { id title }
              userErrors { field message }
            }
          }
        `;
        
        console.log(`📤 Tentative CREATE avec input:`, JSON.stringify(input, null, 2));
        
        const createResp = await fetch(adminUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({ 
            query: createMutation, 
            variables: { input } 
          }),
        });
        
        const createData = await createResp.json();
        console.log(`📥 Réponse CREATE:`, JSON.stringify(createData, null, 2));
        
        createdProduct = createData.data?.productCreate?.product;
        creationErrors = createData.data?.productCreate?.userErrors || [];
        
        if (createdProduct?.id) {
          console.log(`✅ Produit recréé avec succès: ${createdProduct.id}`);
        } else {
          console.error(`❌ Échec de la recréation du produit:`, creationErrors);
        }
      } else {
        console.log(`⚠️ Erreur UPDATE non liée à un produit supprimé - Pas de fallback CREATE`);
      }
    }

    if (!createdProduct?.id) {
      console.error("❌ Aucun produit retourné par Shopify");
      results.push({ status: "error", error: creationErrors });
      continue;
    }

    // --- MAJ SKU / Barcode ---
    if (prod.sku || prod.ean || (prod.variants && prod.variants.length > 0)) {
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

        const variants = variantsData.data?.product?.variants?.edges || [];
        if (!variants.length) {
          console.error("⚠️ Aucune variante trouvée → impossible MAJ SKU/EAN");
        } else {
          // Utiliser GraphQL Admin pour mettre à jour les variantes
          for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];

            // Utiliser GraphQL Admin pour mettre à jour les variantes via productVariantsBulkUpdate
            const updateVariantsMutation = `
              mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                  productVariants {
                    id
                    sku
                    barcode
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            // Préparer les données de la variante à mettre à jour
            let updatedSku = variant.node.sku;
            let updatedBarcode = variant.node.barcode;

            if (prod.variants && prod.variants.length > i) {
              if (prod.variants[i].sku) updatedSku = prod.variants[i].sku;
              if (prod.variants[i].ean) updatedBarcode = prod.variants[i].ean;
            } else {
              if (prod.sku) updatedSku = prod.sku;
              if (prod.ean) updatedBarcode = prod.ean;
            }

            const variantInput = {
              id: variant.node.id,
              // Utiliser les champs corrects pour ProductVariantsBulkInput
              inventoryItem: {
                sku: updatedSku,
              },
              // Le barcode sera géré via une mutation séparée
            };

            const graphqlResp = await fetch(adminUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": token,
              },
              body: JSON.stringify({
                query: updateVariantsMutation,
                variables: {
                  productId: createdProduct.id,
                  variants: [variantInput],
                },
              }),
            });

            const graphqlData = await graphqlResp.json();

            if (graphqlData.data?.productVariantsBulkUpdate?.productVariants) {
              // Mettre à jour le barcode via une mutation séparée si nécessaire
              if (updatedBarcode !== variant.node.barcode) {
                const updateBarcodeMutation = `
                  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                      productVariants {
                        id
                        barcode
                      }
                      userErrors {
                        field
                        message
                      }
                    }
                  }
                `;

                const barcodeInput = {
                  id: variant.node.id,
                  barcode: updatedBarcode,
                };

                const barcodeResp = await fetch(adminUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": token,
                  },
                  body: JSON.stringify({
                    query: updateBarcodeMutation,
                    variables: {
                      productId: createdProduct.id,
                      variants: [barcodeInput],
                    },
                  }),
                });

                const barcodeData = await barcodeResp.json();
                if (
                  barcodeData.data?.productVariantsBulkUpdate?.productVariants
                ) {
                  console.log(
                    `✅ Barcode variante ${i + 1} mis à jour via GraphQL Admin API !`,
                  );
                } else {
                  console.error(
                    `❌ Erreur GraphQL barcode variante ${i + 1}:`,
                    JSON.stringify(barcodeData, null, 2),
                  );
                }
              }
            } else {
              const userErrors =
                graphqlData.data?.productVariantsBulkUpdate?.userErrors || [];
              if (userErrors.length > 0) {
                console.error(
                  `❌ Erreurs GraphQL variante ${i + 1}:`,
                  userErrors
                    .map((err: any) => `${err.field}: ${err.message}`)
                    .join(", "),
                );
              } else {
                console.error(
                  `❌ Erreur GraphQL variante ${i + 1}:`,
                  JSON.stringify(graphqlData, null, 2),
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("💥 Erreur MAJ SKU/EAN :", err);
      }
    }

    /* --- MAJ des images --- */

    // Récupérer les images existantes si c'est un update
    let existingMedia: any[] = [];
    if (prod.id && createdProduct) {
      console.log(
        "🖼️ Début traitement images - Récupération des images existantes",
      );

      // 1. Récupérer les media (images) existants du produit
      const getMediaQuery = `
        query getProductMedia($id: ID!) {
          product(id: $id) {
            media(first: 100) {
              edges {
                node {
                  ... on MediaImage {
                    id
                    image {
                      originalSrc
                    }
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
      existingMedia = mediaEdges
        .map((edge: any) => ({
          id: edge.node?.id,
          originalSrc: edge.node?.image?.originalSrc,
        }))
        .filter(Boolean);

      console.log(
        `📋 ${existingMedia.length} media existants trouvés:`,
        existingMedia,
      );
    }

    // Suppression sélective des images existantes si update
    if (prod.id && createdProduct && existingMedia.length > 0) {
      console.log("🖼️ Suppression sélective des images existantes");

      // 2. Identifier les images à supprimer (celles qui ne sont plus dans la nouvelle liste)
      const imagesToKeep = prod.images || [];
      const imagesToDelete = existingMedia.filter((media: any) => {
        // Garder l'image si elle est dans la nouvelle liste
        return !imagesToKeep.includes(media.originalSrc);
      });

      console.log(
        `🗑️ ${imagesToDelete.length} image(s) à supprimer (plus dans la liste d'export):`,
        imagesToDelete.map((m: any) => m.originalSrc),
      );
      console.log(
        `✅ ${existingMedia.length - imagesToDelete.length} image(s) conservée(s)`,
      );

      // 3. Supprimer seulement les images qui ne sont plus nécessaires
      if (imagesToDelete.length > 0) {
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
            variables: {
              productId: createdProduct.id,
              mediaIds: imagesToDelete.map((m: any) => m.id),
            },
          }),
        });
        const deleteMediaData = await deleteMediaResp.json();
        console.log(
          "🗑️ Résultat suppression media:",
          JSON.stringify(deleteMediaData, null, 2),
        );
      } else {
        console.log("ℹ️ Aucune image à supprimer");
      }
    }

    // Étape 2 : Ajout des images séparément
    if (createdProduct && prod.images?.length) {
      console.log(`🖼️ Vérification et ajout de ${prod.images.length} images`);
      console.log("📋 Images à vérifier:", prod.images);

      // Filtrer les images accessibles
      const accessibleImages = await filterAccessibleImages(prod.images);

      if (accessibleImages.length === 0) {
        console.log(
          "⚠️ Aucune image accessible trouvée - passage à l'étape suivante",
        );
      } else {
        console.log(
          `✅ ${accessibleImages.length} image(s) accessible(s) à ajouter`,
        );

        // Si c'est un update, filtrer les images qui existent déjà
        let imagesToAdd = accessibleImages;
        if (prod.id) {
          // Récupérer les URLs des images existantes
          const existingImageUrls =
            existingMedia?.map((m: any) => m.originalSrc) || [];

          // Filtrer les images qui n'existent pas déjà
          imagesToAdd = accessibleImages.filter(
            (imageUrl: string) => !existingImageUrls.includes(imageUrl),
          );

          console.log(
            `📋 ${accessibleImages.length - imagesToAdd.length} image(s) déjà existante(s) - ignorée(s)`,
          );
          console.log(
            `📤 ${imagesToAdd.length} nouvelle(s) image(s) à ajouter`,
          );
        }

        if (imagesToAdd.length > 0) {
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
            media: imagesToAdd.map((src: string) => ({
              originalSource: src,
              mediaContentType: "IMAGE",
            })),
          };

          console.log(
            "📤 Variables création media:",
            JSON.stringify(imageVariables, null, 2),
          );

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
          console.log(
            "📥 Résultat création media:",
            JSON.stringify(createMediaData, null, 2),
          );

          if (createMediaData.errors) {
            console.error(
              "❌ Erreurs création media:",
              JSON.stringify(createMediaData.errors, null, 2),
            );
          }

          const mediaUserErrors =
            createMediaData.data?.productCreateMedia?.mediaUserErrors || [];
          if (mediaUserErrors.length > 0) {
            console.error(
              "⚠️ Erreurs utilisateur création media:",
              JSON.stringify(mediaUserErrors, null, 2),
            );
          }

          // Vérifier si les images ont été correctement créées
          const createdMedia =
            createMediaData.data?.productCreateMedia?.media || [];
          const failedImages = createdMedia.filter(
            (media: any) => !media.image,
          );

          if (failedImages.length > 0) {
            console.error(
              `❌ ${failedImages.length} image(s) n'ont pas pu être traitées par Shopify:`,
              failedImages.map((m: any) => m.id),
            );
          }

          const successfulImages = createdMedia.filter(
            (media: any) => media.image,
          );
          if (successfulImages.length > 0) {
            console.log(
              `✅ ${successfulImages.length} image(s) créée(s) avec succès`,
            );
          }

          if (mediaUserErrors.length === 0 && failedImages.length === 0) {
            console.log("✅ Tous les media ont été créés avec succès");
          } else {
            console.log(
              "⚠️ Certains media n'ont pas pu être créés correctement",
            );
          }
        } else {
          console.log("ℹ️ Aucune nouvelle image à ajouter");
        }
      }
    } else {
      console.log("ℹ️ Aucune image à ajouter");
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
        console.log(
          "📥 Collections existantes:",
          JSON.stringify(getCollectionsData, null, 2),
        );

        const currentCollections =
          getCollectionsData.data?.product?.collections?.edges?.map(
            (edge: any) => edge.node.id,
          ) || [];
        console.log(
          `🗑️ Suppression de ${currentCollections.length} collections:`,
          currentCollections,
        );

        // 2. Retirer le produit de chaque collection
        for (const collectionId of currentCollections) {
          console.log(
            `🗑️ Suppression du produit de la collection: ${collectionId}`,
          );
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
          console.log(
            `📥 Résultat suppression collection ${collectionId}:`,
            JSON.stringify(removeData, null, 2),
          );

          if (
            removeData.errors ||
            removeData.data?.collectionRemoveProducts?.userErrors?.length
          ) {
            console.error(
              `❌ Erreur suppression collection ${collectionId}:`,
              JSON.stringify(removeData, null, 2),
            );
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
        console.log(
          `📚 Ajout aux ${prod.collections.length} nouvelles collections:`,
          prod.collections,
        );

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
          console.log(
            `📥 Résultat ajout collection ${collectionId}:`,
            JSON.stringify(collectionData, null, 2),
          );

          if (
            collectionData.errors ||
            collectionData.data?.collectionAddProducts?.userErrors?.length
          ) {
            console.error(
              `❌ Erreur ajout collection ${collectionId}:`,
              JSON.stringify(collectionData, null, 2),
            );
            collectionErrors.push({
              collectionId,
              errors: collectionData.errors,
              userErrors:
                collectionData.data?.collectionAddProducts?.userErrors,
            });
          } else {
            console.log(
              `✅ Produit ajouté avec succès à la collection ${collectionId}`,
            );
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
