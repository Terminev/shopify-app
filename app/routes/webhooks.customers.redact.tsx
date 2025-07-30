import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { DataService } from "../utils/data-service";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  const dataService = DataService.getInstance();

  try {
    // Parser le payload du webhook
    const payload = await request.json();
    console.log("🗑️ Payload customers/redact:", payload);

    const { customer_id, shop_id } = payload;

    if (!customer_id || !shop_id) {
      console.error("❌ Données manquantes dans le payload");
      return new Response("Données manquantes", { status: 400 });
    }

    // Supprimer les données du client
    const success = await dataService.deleteCustomerData(customer_id, shop_id);

    if (!success) {
      console.error(`❌ Échec de la suppression des données pour le client ${customer_id}`);
      return new Response("Échec de la suppression", { status: 500 });
    }

    console.log(`✅ Données supprimées avec succès pour le client ${customer_id}`);
    return new Response("Données supprimées avec succès", { status: 200 });

  } catch (error) {
    console.error("❌ Erreur lors du traitement customers/redact:", error);
    return new Response("Erreur interne", { status: 500 });
  }
}; 