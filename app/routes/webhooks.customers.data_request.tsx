import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { DataService } from "../utils/data-service";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  const dataService = DataService.getInstance();

  try {
    // Parser le payload du webhook
    const payload = await request.json();
    console.log("📋 Payload customers/data_request:", payload);

    const { customer_id, shop_id } = payload;

    if (!customer_id || !shop_id) {
      console.error("❌ Données manquantes dans le payload");
      return new Response("Données manquantes", { status: 400 });
    }

    // Générer le rapport GDPR
    const gdprReport = await dataService.generateGDPRReport(customer_id, shop_id);

    if (!gdprReport) {
      console.log(`ℹ️ Aucune donnée trouvée pour le client ${customer_id}`);
      return new Response("Aucune donnée trouvée", { status: 200 });
    }

    // TODO: Envoyer le rapport au propriétaire de la boutique
    // Pour l'instant, on le log
    console.log("📊 Rapport GDPR généré:", JSON.stringify(gdprReport, null, 2));

    // Ici tu pourrais :
    // - Envoyer un email au propriétaire de la boutique
    // - Créer un fichier téléchargeable
    // - Stocker temporairement le rapport pour téléchargement

    return new Response("Rapport généré avec succès", { status: 200 });

  } catch (error) {
    console.error("❌ Erreur lors du traitement customers/data_request:", error);
    return new Response("Erreur interne", { status: 500 });
  }
}; 