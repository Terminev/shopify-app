import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { DataService } from "../utils/data-service";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  const dataService = DataService.getInstance();

  try {
    // Parser le payload du webhook
    const payload = await request.json();
    console.log("🏪 Payload shop/redact:", payload);

    const { shop_id, shop_domain } = payload;

    if (!shop_id || !shop_domain) {
      console.error("❌ Données manquantes dans le payload");
      return new Response("Données manquantes", { status: 400 });
    }

    // Supprimer toutes les données de la boutique
    const success = await dataService.deleteShopData(shop_id);

    if (!success) {
      console.error(`❌ Échec de la suppression des données pour la boutique ${shop_id}`);
      return new Response("Échec de la suppression", { status: 500 });
    }

    console.log(`✅ Données supprimées avec succès pour la boutique ${shop_id} (${shop_domain})`);
    return new Response("Données supprimées avec succès", { status: 200 });

  } catch (error) {
    console.error("❌ Erreur lors du traitement shop/redact:", error);
    return new Response("Erreur interne", { status: 500 });
  }
}; 