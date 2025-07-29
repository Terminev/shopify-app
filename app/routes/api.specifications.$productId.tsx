import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

// Interface pour les spécifications
interface Specification {
  id: string;
  name: string;
  value: string;
  unit?: string;
  category: string;
}

// GET - Récupérer les spécifications d'un produit
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json({ success: false, error: shopifyAuth.error.message }, { status: shopifyAuth.error.status });
  }
  const { token, adminUrl } = shopifyAuth;

  const productId = params.productId;
  if (!productId) {
    return json({ success: false, error: "Product ID manquant" }, { status: 400 });
  }

  // Requête GraphQL pour récupérer les metafields du produit
  const query = `
    query getProductMetafields($id: ID!) {
      product(id: $id) {
        metafields(first: 50) {
          edges {
            node {
              namespace
              key
              value
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(adminUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query,
        variables: { id: productId }
      }),
    });

    const data = await response.json();
    
    if (data.errors) {
      console.error("❌ GraphQL errors:", data.errors);
      return json({ success: false, error: "Erreur GraphQL" }, { status: 500 });
    }

    const metafields = data.data?.product?.metafields?.edges || [];
    const technicalSpecs = metafields.find(
      (edge: any) => edge.node.namespace === "specs" && edge.node.key === "technical"
    );

    let specsArray: { title: string; value: string }[] = [];
    if (technicalSpecs?.node?.value) {
      try {
        specsArray = JSON.parse(technicalSpecs.node.value);
      } catch (error) {
        console.error("❌ Error parsing specs:", error);
      }
    }

    return json({
      success: true,
      specifications: specsArray
    });

  } catch (error) {
    console.error("❌ Error fetching metafields:", error);
    return json({ success: false, error: "Erreur serveur" }, { status: 500 });
  }
};

// POST - Sauvegarder une nouvelle spécification
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const productId = params.productId;
  
  if (!productId) {
    return json({ error: "Product ID requis" }, { status: 400 });
  }

  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { name, value, unit, category } = body;

    if (!name || !value || !category) {
      return json({ error: "Nom, valeur et catégorie requis" }, { status: 400 });
    }

    // TODO: Sauvegarder dans votre vraie API SaaS
    const newSpecification: Specification = {
      id: Date.now().toString(),
      name,
      value,
      unit,
      category
    };

    console.log("Nouvelle spécification sauvegardée:", newSpecification);

    return json({ 
      success: true, 
      specification: newSpecification 
    });
  } catch (error) {
    console.error("Erreur lors de la sauvegarde:", error);
    return json({ error: "Erreur serveur" }, { status: 500 });
  }
}; 