import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { prisma } from "../db/index.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Vérifier que c'est une requête POST
  if (request.method !== "POST") {
    return json(
      { 
        success: false, 
        error: "Méthode non autorisée. Utilisez POST." 
      },
      { status: 405 }
    );
  }

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

  // Lire le body JSON
  let body: any;
  const shopDomain = shopSettings.shop;
  const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;

  try {
    body = await request.json();
  } catch (err) {
    return json({ success: false, error: "Body JSON invalide" }, { status: 400 });
  }

  if (!body.products || !Array.isArray(body.products)) {
    return json({ success: false, error: "Le body doit contenir un tableau 'products'" }, { status: 400 });
  }

  // Créer les produits en base
  const created: any[] = [];
  for (const prod of body.products) {
    if (!prod.title) continue;

    // Préparer l'input pour la mutation productCreate (title + description uniquement)
    const input: any = {
      title: prod.title,
    };
    if (prod.description) input.descriptionHtml = prod.description;
    if (prod.status) input.status = prod.status;
    if (prod.vendor) input.vendor = prod.vendor;
    if (prod.productType) input.productType = prod.productType;
    if (prod.tags) input.tags = Array.isArray(prod.tags) ? prod.tags : [prod.tags];
    if (prod.images && Array.isArray(prod.images) && prod.images.length > 0) {
      input.images = prod.images.map((url: string) => ({ src: url }));
    }

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
    const imageErrors = (data.data?.productCreate?.userErrors || []).filter((err: any) => (err.field || []).includes('images'));
    if (createdProduct) {
      // Ajouter le produit aux collections si besoin
      let collectionErrors: any[] = [];
      if (prod.collections && Array.isArray(prod.collections) && prod.collections.length > 0) {
        for (const collectionId of prod.collections) {
          const addToCollectionMutation = `
            mutation addProductToCollection($id: ID!, $productIds: [ID!]!) {
              collectionAddProducts(id: $id, productIds: $productIds) {
                userErrors { field message }
              }
            }
          `;
          const resp = await fetch(adminUrl, {
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
          const data = await resp.json();
          // Log et collecte les erreurs éventuelles
          if (data.errors || data.data?.collectionAddProducts?.userErrors?.length) {
            collectionErrors.push({
              collectionId,
              errors: data.errors,
              userErrors: data.data?.collectionAddProducts?.userErrors
            });
          }
        }
      }
      created.push({ ...createdProduct, collectionErrors, imageErrors });
    }
  }

  return json({
    success: true,
    created_count: created.length,
    created_products: created,
  });


};
