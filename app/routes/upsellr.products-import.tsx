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

  try {
    // Récupérer les données du body de la requête
    const body = await request.json();
    const { products } = body;

    if (!products || !Array.isArray(products)) {
      return json(
        { 
          success: false, 
          error: "Données invalides. Le body doit contenir un tableau 'products'" 
        },
        { status: 400 }
      );
    }

    const shopDomain = shopSettings.shop;
    const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;

    const results = {
      success: [] as any[],
      errors: [] as any[]
    };

    // Traiter chaque produit
    for (const productData of products) {
      try {
        let mutation, variables;
        if (productData.id) {
          // PATCH (update)
          mutation = `
            mutation productUpdate($input: ProductInput!) {
              productUpdate(input: $input) {
                product { id title handle vendor productType tags descriptionHtml status }
                userErrors { field message code }
              }
            }
          `;
          // Construit dynamiquement l'objet input avec uniquement les champs fournis
          const input: any = { id: productData.id };
          if (productData.title) input.title = productData.title;
          if (productData.description) input.descriptionHtml = productData.description;
          if (productData.vendor) input.vendor = productData.vendor;
          if (productData.productType) input.productType = productData.productType;
          if (productData.tags) input.tags = productData.tags;
          if (productData.status) input.status = productData.status;
          // Ajoute d'autres champs si besoin
          variables = { input };
        } else {
          // CREATE
          mutation = `
            mutation productCreate($input: ProductInput!) {
              productCreate(input: $input) {
                product { id title handle }
                userErrors { field message code }
              }
            }
          `;
          variables = {
            input: {
              title: productData.title,
              descriptionHtml: productData.description || "",
              vendor: productData.vendor || "",
              productType: productData.productType || "",
              tags: productData.tags || [],
              status: productData.status || "ACTIVE"
            }
          };
        }

        const response = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token || '',
          },
          body: JSON.stringify({ query: mutation, variables })
        });

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status}`);
        }

        const result = await response.json();
        let userErrors = [];
        let product = null;
        if (productData.id) {
          userErrors = result.data?.productUpdate?.userErrors || [];
          product = result.data?.productUpdate?.product;
        } else {
          userErrors = result.data?.productCreate?.userErrors || [];
          product = result.data?.productCreate?.product;
        }
        if (userErrors.length > 0) {
          results.errors.push({
            product: productData.title || "Produit inconnu",
            errors: userErrors
          });
        } else if (product) {
          results.success.push({
            product,
            originalData: productData
          });
        }

      } catch (error) {
        results.errors.push({
          product: productData.title || "Produit inconnu",
          errors: [{ message: error instanceof Error ? error.message : "Erreur inconnue" }]
        });
      }
    }

    return json({
      success: true,
      message: `Import terminé. ${results.success.length} produits créés, ${results.errors.length} erreurs.`,
      results
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    return json(
      { 
        success: false, 
        error: `Erreur lors de l'import des produits: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
};
