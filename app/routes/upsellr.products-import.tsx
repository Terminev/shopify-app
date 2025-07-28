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

      // Construction de l’input à partir de prod.variants[] si existant, sinon prod.sku / prod.barcode global
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

        return {
          id: v.node.id,
          sku,
          barcode,
        };
      });
      console.log(
        "📤 Input BulkUpdate :",
        JSON.stringify(variantsInput, null, 2),
      );

      const updateVariantsMutation = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id sku barcode }
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
      console.log(
        "📥 Résultat BulkUpdate :",
        JSON.stringify(updateVariantsData, null, 2),
      );

      const errors =
        updateVariantsData.data?.productVariantsBulkUpdate?.userErrors ||
        [];
      if (errors.length) {
        console.error(
          "⚠️ Erreurs BulkUpdate :",
          JSON.stringify(errors, null, 2),
        );
      } else {
        console.log("✅ SKU/EAN mis à jour !");
      }
    }
  } catch (err) {
    console.error("💥 Erreur MAJ SKU/EAN :", err);
  }
}


    results.push({
      status: creationErrors.length ? "error" : "ok",
      error: creationErrors.map((e) => e.message).join(", ") || null,
      shopify_id: createdProduct.id,
      upsellr_raw_id: upsellrRawId,
    });
  }

  return json({ results });
};
