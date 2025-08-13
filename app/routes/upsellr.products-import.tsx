import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

// Function to check if an image is accessible
async function checkImageAccessibility(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, {
      method: "HEAD",
      // Add a timeout to avoid blocking
      signal: AbortSignal.timeout(10000), // 10 seconds timeout
    });

    if (!response.ok) {
      console.log(`❌ Image inaccessible (${response.status}): ${imageUrl}`);
      return false;
    }

    // Check that it is actually an image
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
      console.log(
        `❌ URL does not point to an image (${contentType}): ${imageUrl}`,
      );
      return false;
    }

    // Check content size if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) === 0) {
      console.log(`❌ Empty image (0 bytes): ${imageUrl}`);
      return false;
    }

    // Special check for Shopify images
    if (imageUrl.includes("cdn.shopify.com")) {
      // For Shopify images, do a more thorough check
      try {
        const fullResponse = await fetch(imageUrl, {
          method: "GET",
          signal: AbortSignal.timeout(15000), // 15 seconds for full download
        });

        if (!fullResponse.ok) {
          console.log(
            `❌ Shopify image inaccessible (${fullResponse.status}): ${imageUrl}`,
          );
          return false;
        }

        const buffer = await fullResponse.arrayBuffer();
        if (buffer.byteLength === 0) {
          console.log(`❌ Shopify image empty (0 bytes): ${imageUrl}`);
          return false;
        }

        console.log(
          `✅ Shopify image accessible (${buffer.byteLength} bytes): ${imageUrl}`,
        );
        return true;
      } catch (shopifyError) {
        console.log(
          `❌ Error during full check of Shopify image ${imageUrl}:`,
          shopifyError,
        );
        return false;
      }
    }

    console.log(`✅ Image accessible (${contentType}): ${imageUrl}`);
    return true;
  } catch (error) {
    console.log(
      `❌ Error while checking image ${imageUrl}:`,
      error,
    );
    return false;
  }
}

// Function to filter accessible images
async function filterAccessibleImages(images: string[]): Promise<string[]> {
  console.log(
    `🔍 Checking accessibility of ${images.length} images...`,
  );

  const accessibleImages: string[] = [];
  const inaccessibleImages: string[] = [];

  // Check each image in parallel for better performance
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
      // In case of error, consider the image as inaccessible
      console.log(`❌ Error while checking an image`);
    }
  }

  if (inaccessibleImages.length > 0) {
    console.log(
      `⚠️ ${inaccessibleImages.length} inaccessible image(s) filtered:`,
      inaccessibleImages,
    );
  }

  console.log(
    `✅ ${accessibleImages.length} accessible image(s) kept`,
  );
  return accessibleImages;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed. Use POST." },
      { status: 405 },
    );
  }

  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    console.error(
      "❌ Shopify authentication error:",
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
    console.error("❌ Invalid JSON body");
    return json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.products || !Array.isArray(body.products)) {
    console.error("❌ Body does not contain a valid products array");
    return json(
      { success: false, error: "Body must contain a 'products' array" },
      { status: 400 },
    );
  }

  const results: any[] = [];
  for (const prod of body.products) {
    if (!prod.title && !prod.id) continue;

    const upsellrRawId = prod.upsellr_raw_id ?? null;

    const input: any = { title: prod.title };
    if (prod.description) input.descriptionHtml = prod.description;
    
    // Status logic: UPDATE = keep current status, CREATE = default to PENDING
    if (prod.id) {
      // UPDATE: do not modify status, keep as set by the user
      console.log(`🔄 UPDATE - Status not changed (kept as set by the user)`);
    } else {
      // CREATE: default status is PENDING
      input.status = "DRAFT";
      console.log(`📝 CREATE - Status set to PENDING by default`);
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

    // Handle technical specifications
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
      // Try UPDATE first
      mutation = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title }
            userErrors { field message }
          }
        }
      `;
    } else {
      // Direct CREATE
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

    // --- Product creation or update ---
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

    // If UPDATE fails (product deleted), try CREATE
    if (!createdProduct?.id && prod.id && creationErrors.length > 0) {
      console.log(`⚠️ UPDATE failed for ${prod.id} - Trying CREATE instead`);
      console.log(`📋 Detected errors:`, JSON.stringify(creationErrors, null, 2));
      
      // Check if the error indicates the product does not exist
      const productNotFound = creationErrors.some((error: any) => {
        const message = error.message?.toLowerCase() || '';
        return message.includes("not found") || 
               message.includes("doesn't exist") ||
               message.includes("product not found") ||
               message.includes("could not find") ||
               message.includes("invalid id") ||
               message.includes("does not exist");
      });
      
      console.log(`🔍 Detected "product not found" error: ${productNotFound}`);
      
      if (productNotFound) {
        console.log(`🔄 Product ${prod.id} deleted on Shopify side - Creating a new product`);
        
        // Remove ID to do a CREATE
        delete input.id;
        input.status = "DRAFT"; // Default status for new product
        
        const createMutation = `
          mutation productCreate($input: ProductInput!) {
            productCreate(input: $input) {
              product { id title }
              userErrors { field message }
            }
          }
        `;
        
        console.log(`📤 Trying CREATE with input:`, JSON.stringify(input, null, 2));
        
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
        console.log(`📥 CREATE response:`, JSON.stringify(createData, null, 2));
        
        createdProduct = createData.data?.productCreate?.product;
        creationErrors = createData.data?.productCreate?.userErrors || [];
        
        if (createdProduct?.id) {
          console.log(`✅ Product successfully recreated: ${createdProduct.id}`);
        } else {
          console.error(`❌ Failed to recreate product:`, creationErrors);
        }
      } else {
        console.log(`⚠️ UPDATE error not related to deleted product - No CREATE fallback`);
      }
    }

    if (!createdProduct?.id) {
      console.error("❌ No product returned by Shopify");
      results.push({ status: "error", error: creationErrors });
      continue;
    }

    // --- Update SKU / Barcode ---
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
          console.error("⚠️ No variant found → cannot update SKU/EAN");
        } else {
          // Use GraphQL Admin to update variants
          for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];

            // Use GraphQL Admin to update variants via productVariantsBulkUpdate
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

            // Prepare the variant data to update
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
              // Use correct fields for ProductVariantsBulkInput
              inventoryItem: {
                sku: updatedSku,
              },
              // Barcode will be handled via a separate mutation
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
              // Update barcode via a separate mutation if needed
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
                    `✅ Barcode for variant ${i + 1} updated via GraphQL Admin API!`,
                  );
                } else {
                  console.error(
                    `❌ GraphQL error updating barcode for variant ${i + 1}:`,
                    JSON.stringify(barcodeData, null, 2),
                  );
                }
              }
            } else {
              const userErrors =
                graphqlData.data?.productVariantsBulkUpdate?.userErrors || [];
              if (userErrors.length > 0) {
                console.error(
                  `❌ GraphQL errors for variant ${i + 1}:`,
                  userErrors
                    .map((err: any) => `${err.field}: ${err.message}`)
                    .join(", "),
                );
              } else {
                console.error(
                  `❌ GraphQL error for variant ${i + 1}:`,
                  JSON.stringify(graphqlData, null, 2),
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("💥 Error updating SKU/EAN:", err);
      }
    }

    /* --- Update images --- */

    // Retrieve existing images if this is an update
    let existingMedia: any[] = [];
    if (prod.id && createdProduct) {
      console.log(
        "🖼️ Start image processing - Retrieving existing images",
      );

      // 1. Retrieve existing media (images) for the product
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
      console.log("📡 Retrieving existing media for:", createdProduct.id);
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
      console.log("📥 Existing media:", JSON.stringify(getMediaData, null, 2));

      const mediaEdges = getMediaData.data?.product?.media?.edges || [];
      existingMedia = mediaEdges
        .map((edge: any) => ({
          id: edge.node?.id,
          originalSrc: edge.node?.image?.originalSrc,
        }))
        .filter(Boolean);

      console.log(
        `📋 ${existingMedia.length} existing media found:`,
        existingMedia,
      );
    }

    // Selective deletion of existing images if update
    if (prod.id && createdProduct && existingMedia.length > 0) {
      console.log("🖼️ Selective deletion of existing images");

      // 2. Identify images to delete (those no longer in the new list)
      const imagesToKeep = prod.images || [];
      const imagesToDelete = existingMedia.filter((media: any) => {
        // Keep the image if it is in the new list
        return !imagesToKeep.includes(media.originalSrc);
      });

      console.log(
        `🗑️ ${imagesToDelete.length} image(s) to delete (no longer in export list):`,
        imagesToDelete.map((m: any) => m.originalSrc),
      );
      console.log(
        `✅ ${existingMedia.length - imagesToDelete.length} image(s) kept`,
      );

      // 3. Delete only images that are no longer needed
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
          "🗑️ Media deletion result:",
          JSON.stringify(deleteMediaData, null, 2),
        );
      } else {
        console.log("ℹ️ No images to delete");
      }
    }

    // Step 2: Add images separately
    if (createdProduct && prod.images?.length) {
      console.log(`🖼️ Checking and adding ${prod.images.length} images`);
      console.log("📋 Images to check:", prod.images);

      // Filter accessible images
      const accessibleImages = await filterAccessibleImages(prod.images);

      if (accessibleImages.length === 0) {
        console.log(
          "⚠️ No accessible image found - moving to next step",
        );
      } else {
        console.log(
          `✅ ${accessibleImages.length} accessible image(s) to add`,
        );

        // If this is an update, filter out images that already exist
        let imagesToAdd = accessibleImages;
        if (prod.id) {
          // Get URLs of existing images
          const existingImageUrls =
            existingMedia?.map((m: any) => m.originalSrc) || [];

          // Filter images that do not already exist
          imagesToAdd = accessibleImages.filter(
            (imageUrl: string) => !existingImageUrls.includes(imageUrl),
          );

          console.log(
            `📋 ${accessibleImages.length - imagesToAdd.length} image(s) already exist - ignored`,
          );
          console.log(
            `📤 ${imagesToAdd.length} new image(s) to add`,
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
            "📤 Media creation variables:",
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
            "📥 Media creation result:",
            JSON.stringify(createMediaData, null, 2),
          );

          if (createMediaData.errors) {
            console.error(
              "❌ Media creation errors:",
              JSON.stringify(createMediaData.errors, null, 2),
            );
          }

          const mediaUserErrors =
            createMediaData.data?.productCreateMedia?.mediaUserErrors || [];
          if (mediaUserErrors.length > 0) {
            console.error(
              "⚠️ User errors during media creation:",
              JSON.stringify(mediaUserErrors, null, 2),
            );
          }

          // Check if images were created successfully
          const createdMedia =
            createMediaData.data?.productCreateMedia?.media || [];
          const failedImages = createdMedia.filter(
            (media: any) => !media.image,
          );

          if (failedImages.length > 0) {
            console.error(
              `❌ ${failedImages.length} image(s) could not be processed by Shopify:`,
              failedImages.map((m: any) => m.id),
            );
          }

          const successfulImages = createdMedia.filter(
            (media: any) => media.image,
          );
          if (successfulImages.length > 0) {
            console.log(
              `✅ ${successfulImages.length} image(s) created successfully`,
            );
          }

          if (mediaUserErrors.length === 0 && failedImages.length === 0) {
            console.log("✅ All media created successfully");
          } else {
            console.log(
              "⚠️ Some media could not be created properly",
            );
          }
        } else {
          console.log("ℹ️ No new images to add");
        }
      }
    } else {
      console.log("ℹ️ No images to add");
    }

    // Add to collections
    let collectionErrors: any[] = [];
    if (createdProduct) {
      console.log("📚 Start processing collections");

      // If update, remove the product from all existing collections before adding new ones (or nothing if prod.collections is empty)
      if (prod.id) {
        console.log("🔄 UPDATE mode - Removing existing collections");

        // 1. Retrieve all collections for the product
        const getCollectionsQuery = `
          query getProductCollections($id: ID!) {
            product(id: $id) {
              collections(first: 100) {
                edges { node { id } }
              }
            }
          }
        `;
        console.log("📡 Retrieving existing collections");
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
          "📥 Existing collections:",
          JSON.stringify(getCollectionsData, null, 2),
        );

        const currentCollections =
          getCollectionsData.data?.product?.collections?.edges?.map(
            (edge: any) => edge.node.id,
          ) || [];
        console.log(
          `🗑️ Removing from ${currentCollections.length} collections:`,
          currentCollections,
        );

        // 2. Remove the product from each collection
        for (const collectionId of currentCollections) {
          console.log(
            `🗑️ Removing product from collection: ${collectionId}`,
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
            `📥 Collection removal result ${collectionId}:`,
            JSON.stringify(removeData, null, 2),
          );

          if (
            removeData.errors ||
            removeData.data?.collectionRemoveProducts?.userErrors?.length
          ) {
            console.error(
              `❌ Error removing from collection ${collectionId}:`,
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
      // Add to new collections (existing logic)
      if (prod.collections && prod.collections.length) {
        console.log(
          `📚 Adding to ${prod.collections.length} new collections:`,
          prod.collections,
        );

        for (const collectionId of prod.collections) {
          console.log(`➕ Adding product to collection: ${collectionId}`);
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
            `📥 Collection add result ${collectionId}:`,
            JSON.stringify(collectionData, null, 2),
          );

          if (
            collectionData.errors ||
            collectionData.data?.collectionAddProducts?.userErrors?.length
          ) {
            console.error(
              `❌ Error adding to collection ${collectionId}:`,
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
              `✅ Product successfully added to collection ${collectionId}`,
            );
          }
        }
      } else {
        console.log("ℹ️ No collections to add");
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
