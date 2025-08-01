import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic } = await authenticate.webhook(request);
    
    console.log(`📡 Webhook reçu: ${topic} pour ${shop}`);
    
    // Traitement spécifique pour app/uninstalled
    if (topic === "app/uninstalled") {
      console.log(`🗑️ App désinstallée pour ${shop}`);
      // Ici tu peux ajouter la logique pour nettoyer les données
      // Par exemple, supprimer les données du shop de la base de données
    }
    
    // Retourner une réponse 200 OK
    return new Response("OK", { 
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
    
  } catch (error) {
    console.error(`❌ Erreur webhook app/uninstalled:`, error);
    
    // Retourner une erreur 500 pour que Shopify retry
    return new Response("Internal Server Error", { 
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
