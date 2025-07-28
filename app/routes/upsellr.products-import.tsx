import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

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
if (prod.sku || prod.barcode || (prod.variants && prod.variants.length > 0)) {
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

      // Utiliser productVariantsBulkUpdate avec metafields pour SKU et barcode
      const variantsInput = variants.map((v: any, index: number) => {
        let sku = v.node.sku;
        let barcode = v.node.barcode;

        if (prod.variants && prod.variants.length > index) {
          if (prod.variants[index].sku) sku = prod.variants[index].sku;
          if (prod.variants[index].barcode) barcode = prod.variants[index].barcode;
        } else {
          if (prod.sku) sku = prod.sku;
          if (prod.barcode) barcode = prod.barcode;
        }

        const metafields = [];
        if (sku) {
          metafields.push({
            namespace: "custom",
            key: "sku",
            value: sku,
            type: "single_line_text_field"
          });
        }
        if (barcode) {
          metafields.push({
            namespace: "custom",
            key: "barcode",
            value: barcode,
            type: "single_line_text_field"
          });
        }

        return {
          id: v.node.id,
          metafields: metafields
        };
      });

      console.log("📤 Input BulkUpdate avec metafields:", JSON.stringify(variantsInput, null, 2));

      const updateVariantsMutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { 
              id 
              title 
              sku 
              barcode
              metafields(first: 10) {
                edges {
                  node {
                    namespace
                    key
                    value
                  }
                }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const updateVariantsResp = await fetch(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: updateVariantsMutation,
          variables: {
            productId: createdProduct.id,
            variants: variantsInput,
          },
        }),
      });

      const updateVariantsData = await updateVariantsResp.json();
      console.log("📥 Résultat BulkUpdate:", JSON.stringify(updateVariantsData, null, 2));

      if (updateVariantsData.errors) {
        console.error("❌ Erreur BulkUpdate:", JSON.stringify(updateVariantsData.errors, null, 2));
        
        // Si ça ne marche pas, essayer avec une approche REST API
        console.log("🔄 Tentative avec REST API...");
        
        // Utiliser l'API REST pour mettre à jour les variantes
        for (let i = 0; i < variants.length; i++) {
          const variant = variants[i];
          let sku = variant.node.sku;
          let barcode = variant.node.barcode;

          if (prod.variants && prod.variants.length > i) {
            if (prod.variants[i].sku) sku = prod.variants[i].sku;
            if (prod.variants[i].barcode) barcode = prod.variants[i].barcode;
          } else {
            if (prod.sku) sku = prod.sku;
            if (prod.barcode) barcode = prod.barcode;
          }

          // Extraire l'ID de la variante de l'URL GraphQL
          const variantId = variant.node.id.split('/').pop();
          const restUrl = `https://${shopifyAuth.shopDomain}/admin/api/2024-01/variants/${variantId}.json`;
          
          const variantData = {
            variant: {
              id: variantId,
              sku: sku || null,
              barcode: barcode || null
            }
          };

          console.log(`📤 REST Update variante ${i + 1}:`, JSON.stringify(variantData, null, 2));

          const restResp = await fetch(restUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify(variantData),
          });

          const restData = await restResp.json();
          console.log(`📥 Résultat REST variante ${i + 1}:`, JSON.stringify(restData, null, 2));

          if (restResp.ok) {
            console.log(`✅ Variante ${i + 1} mise à jour via REST API !`);
          } else {
            console.error(`❌ Erreur REST variante ${i + 1}:`, JSON.stringify(restData, null, 2));
          }
        }
      } else {
        const errors = updateVariantsData.data?.productVariantsBulkUpdate?.userErrors || [];
        if (errors.length) {
          console.error("⚠️ Erreurs BulkUpdate:", JSON.stringify(errors, null, 2));
        } else {
          console.log("✅ SKU/EAN mis à jour via BulkUpdate avec metafields !");
        }
      }
    }
  } catch (err) {
    console.error("💥 Erreur MAJ SKU/EAN :", err);
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
