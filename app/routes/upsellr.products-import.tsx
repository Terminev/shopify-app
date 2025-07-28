import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("==> /upsellr/products-import called");

  // Vérif méthode
  if (request.method !== "POST") {
    console.log("Mauvaise méthode :", request.method);
    return json(
      { success: false, error: "Méthode non autorisée. Utilisez POST." },
      { status: 405 },
    );
  }

  // Auth Shopify
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json(
      { success: false, error: shopifyAuth.error.message },
      { status: shopifyAuth.error.status },
    );
  }
  const { token, adminUrl } = shopifyAuth;

  // Lecture body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(
      { success: false, error: "Body JSON invalide" },
      { status: 400 },
    );
  }
  if (!body.products || !Array.isArray(body.products)) {
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

    // Champs de base
    if (prod.description) input.descriptionHtml = prod.description;
    if (prod.status) input.status = prod.status;
    if (prod.vendor) input.vendor = prod.vendor;
    if (prod.productType) input.productType = prod.productType;
    if (prod.tags)
      input.tags = Array.isArray(prod.tags) ? prod.tags : [prod.tags];
    if (prod.meta_title) input.seo = { ...input.seo, title: prod.meta_title };
    if (prod.meta_description)
      input.seo = { ...input.seo, description: prod.meta_description };

    // Short description
    if (prod.short_description) {
      input.metafields = [
        {
          namespace: "custom",
          key: "short_description",
          value: prod.short_description,
          type: "string",
        },
      ];
    }

    // Gestion SKU / EAN
    let variantId: string | null = null;
    if (prod.id) {
      // Update → on récupère variantId
      input.id = prod.id;

      const variantQuery = `
        query getVariant($id: ID!) {
          product(id: $id) {
            variants(first: 1) {
              edges {
                node {
                  id
                  sku
                  barcode
                }
              }
            }
          }
        }
      `;
      const variantResp = await fetch(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: variantQuery,
          variables: { id: prod.id },
        }),
      });
      const variantData = await variantResp.json();
      variantId =
        variantData.data?.product?.variants?.edges?.[0]?.node?.id || null;
    }

    if (prod.sku || prod.ean) {
      const variantInput: any = {};
      if (variantId) variantInput.id = variantId; // seulement en update
      if (prod.sku) variantInput.sku = prod.sku;
      if (prod.ean) variantInput.barcode = prod.ean;
      input.variants = [variantInput];
    }

    // Mutation
    let mutation: string;
    if (prod.id) {
      mutation = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id title
              descriptionHtml
              variants(first: 1) { edges { node { id sku barcode } } }
              seo { title description }
              metafield(namespace: "custom", key: "short_description") { value }
            }
            userErrors { field message }
          }
        }
      `;
    } else {
      mutation = `
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id title
              descriptionHtml
              variants(first: 1) { edges { node { id sku barcode } } }
              seo { title description }
              metafield(namespace: "custom", key: "short_description") { value }
            }
            userErrors { field message }
          }
        }
      `;
    }

    const resp = await fetch(adminUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: mutation, variables: { input } }),
    });

    const data = await resp.json();
    const resultData = prod.id
      ? data.data?.productUpdate
      : data.data?.productCreate;
    const createdProduct = resultData?.product;
    const creationErrors = resultData?.userErrors || [];

    // Suppression images si update
    if (prod.id && createdProduct) {
      const getMediaQuery = `
        query getMedia($id: ID!) {
          product(id: $id) {
            media(first: 100) {
              edges { node { ... on MediaImage { id } } }
            }
          }
        }
      `;
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
      const mediaEdges =
        (await getMediaResp.json()).data?.product?.media?.edges || [];
      const mediaIds = mediaEdges
        .map((edge: any) => edge.node?.id)
        .filter(Boolean);

      if (mediaIds.length > 0) {
        const deleteMediaMutation = `
          mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
            productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
              deletedMediaIds userErrors { field message }
            }
          }
        `;
        await fetch(adminUrl, {
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
      }
    }

    // Ajout images
    if (createdProduct && prod.images?.length) {
      const imageMutation = `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { ... on MediaImage { id image { id originalSrc } } }
            mediaUserErrors { field message }
          }
        }
      `;
      await fetch(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: imageMutation,
          variables: {
            productId: createdProduct.id,
            media: prod.images.map((src: string) => ({
              originalSource: src,
              mediaContentType: "IMAGE",
            })),
          },
        }),
      });
    }

    // Collections
    let collectionErrors: any[] = [];
    if (createdProduct) {
      if (prod.id) {
        const getCollectionsQuery = `
          query getCollections($id: ID!) {
            product(id: $id) { collections(first: 100) { edges { node { id } } } }
          }
        `;
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
        const currentCollections =
          (
            await getCollectionsResp.json()
          ).data?.product?.collections?.edges?.map((e: any) => e.node.id) || [];

        for (const colId of currentCollections) {
          const removeMutation = `
            mutation removeProduct($id: ID!, $productIds: [ID!]!) {
              collectionRemoveProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }
          `;
          await fetch(adminUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify({
              query: removeMutation,
              variables: { id: colId, productIds: [createdProduct.id] },
            }),
          });
        }
      }

      if (prod.collections?.length) {
        for (const colId of prod.collections) {
          const addMutation = `
            mutation addProduct($id: ID!, $productIds: [ID!]!) {
              collectionAddProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }
          `;
          await fetch(adminUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify({
              query: addMutation,
              variables: { id: colId, productIds: [createdProduct.id] },
            }),
          });
        }
      }
    }

    // Metafields refresh
    let shortDescription = createdProduct?.metafield?.value || null;
    if (createdProduct) {
      const metafieldsQuery = `
        query getMetafields($id: ID!) {
          product(id: $id) {
            shortDescriptionMetafield: metafield(namespace: "custom", key: "short_description") {
              value
            }
          }
        }
      `;
      const metaResp = await fetch(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: metafieldsQuery,
          variables: { id: createdProduct.id },
        }),
      });
      shortDescription =
        (await metaResp.json()).data?.product?.shortDescriptionMetafield
          ?.value || shortDescription;
    }

    results.push({
      status: creationErrors.length ? "error" : "ok",
      error: creationErrors.length
        ? creationErrors.map((e: any) => e.message).join(", ")
        : null,
      shopify_id: createdProduct?.id || null,
      upsellr_raw_id: upsellrRawId,
      meta_title: createdProduct?.seo?.title || null,
      meta_description: createdProduct?.seo?.description || null,
      short_description: shortDescription,
      sku: createdProduct?.variants?.edges?.[0]?.node?.sku || null,
      ean: createdProduct?.variants?.edges?.[0]?.node?.barcode || null,
    });
  }

  return json({ results });
};
