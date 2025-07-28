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

      // Mise à jour individuelle de chaque variante
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        let sku = variant.node.sku;
        let barcode = variant.node.barcode;

        // Déterminer les nouvelles valeurs
        if (prod.variants && prod.variants.length > i) {
          if (prod.variants[i].sku) sku = prod.variants[i].sku;
          if (prod.variants[i].barcode) barcode = prod.variants[i].barcode;
        } else {
          if (prod.sku) sku = prod.sku;
          if (prod.barcode) barcode = prod.barcode;
        }

        // Essayer avec productVariantUpdate (si disponible)
        const updateVariantMutation = `
          mutation productVariantUpdate($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              productVariant { id sku barcode }
              userErrors { field message }
            }
          }
        `;

        const variantInput = {
          id: variant.node.id,
          sku: sku || null,
          barcode: barcode || null,
        };

        console.log(`📤 Update variante ${i + 1}:`, JSON.stringify(variantInput, null, 2));

        const updateVariantResp = await fetch(adminUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({
            query: updateVariantMutation,
            variables: { input: variantInput },
          }),
        });

        const updateVariantData = await updateVariantResp.json();
        console.log(
          `📥 Résultat update variante ${i + 1}:`,
          JSON.stringify(updateVariantData, null, 2),
        );

        if (updateVariantData.errors) {
          console.error(`❌ Erreur mutation pour variante ${i + 1}:`, JSON.stringify(updateVariantData.errors, null, 2));
          
          // Si productVariantUpdate n'existe pas, essayer avec productVariantsBulkUpdate
          console.log(`🔄 Tentative avec productVariantsBulkUpdate pour variante ${i + 1}...`);
          
          const bulkUpdateMutation = `
            mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                productVariants { id title sku barcode }
                userErrors { field message }
              }
            }
          `;

          const bulkInput = [{
            id: variant.node.id,
            // Essayer avec des champs différents selon la documentation
            options: [
              { name: "Title", value: variant.node.title }
            ]
          }];

          const bulkResp = await fetch(adminUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify({
              query: bulkUpdateMutation,
              variables: {
                productId: createdProduct.id,
                variants: bulkInput,
              },
            }),
          });

          const bulkData = await bulkResp.json();
          console.log(`📥 Résultat BulkUpdate variante ${i + 1}:`, JSON.stringify(bulkData, null, 2));

          const bulkErrors = bulkData.data?.productVariantsBulkUpdate?.userErrors || [];
          if (bulkErrors.length) {
            console.error(`⚠️ Erreurs BulkUpdate variante ${i + 1}:`, JSON.stringify(bulkErrors, null, 2));
          } else {
            console.log(`✅ Variante ${i + 1} mise à jour via BulkUpdate !`);
          }
        } else {
          const errors = updateVariantData.data?.productVariantUpdate?.userErrors || [];
          if (errors.length) {
            console.error(`⚠️ Erreurs update variante ${i + 1}:`, JSON.stringify(errors, null, 2));
          } else {
            console.log(`✅ Variante ${i + 1} mise à jour !`);
          }
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
