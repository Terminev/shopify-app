import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { prisma } from "../db/index.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("==> /upsellr/products-import called");
  if (request.method !== "POST") {
    console.log("Mauvaise méthode :", request.method);
    return json({ success: false, error: "Méthode non autorisée. Utilisez POST." }, { status: 405 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  console.log("Token reçu :", token);

  if (!token || !token.startsWith("shpua_")) {
    console.log("Token invalide ou manquant");
    return json({ success: false, error: "Token invalide ou manquant" }, { status: 401 });
  }

  const shopSettings = await prisma.shopSetting.findFirst();
  if (!shopSettings) {
    console.log("Aucune boutique configurée");
    return json({ success: false, error: "Aucune boutique configurée" }, { status: 404 });
  }

  await prisma.shopSetting.update({
    where: { id: shopSettings.id },
    data: { shopifyToken: token },
  });

  let body: any;
  try {
    body = await request.json();
  } catch (err) {
    return json({ success: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (!body.products || !Array.isArray(body.products)) {
    return json({ success: false, error: "Le body doit contenir un tableau 'products'" }, { status: 400 });
  }

  const shopDomain = shopSettings.shop;
  const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;

  const created: any[] = [];

  for (const prod of body.products) {
    if (!prod.title) continue;

    const input: any = {
      title: prod.title,
    };
    if (prod.description) input.descriptionHtml = prod.description;
    if (prod.status) input.status = prod.status;
    if (prod.vendor) input.vendor = prod.vendor;
    if (prod.productType) input.productType = prod.productType;
    if (prod.tags) input.tags = Array.isArray(prod.tags) ? prod.tags : [prod.tags];

    const mutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product { id title descriptionHtml }
          userErrors { field message }
        }
      }
    `;

    const variables = { input };

    const resp = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const data = await resp.json();
    const createdProduct = data.data?.productCreate?.product;
    const creationErrors = data.data?.productCreate?.userErrors || [];

    let imageErrors = [];
    let appendedImages = [];

    // Étape 2 : Ajout des images séparément
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
        media: prod.images.map((src: string) => ({
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
    let collectionErrors: any[] = [];
    if (createdProduct && prod.collections?.length) {
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

    if (createdProduct) {
      created.push({
        ...createdProduct,
        creationErrors,
        imageErrors,
        appendedImages,
        collectionErrors,
      });
    }
  }

  return json({
    success: true,
    created_count: created.length,
    created_products: created,
  });
};
