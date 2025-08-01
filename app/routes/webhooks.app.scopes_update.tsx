import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic } = await authenticate.webhook(request);
    
    console.log(`📡 Webhook reçu: ${topic} pour ${shop}`);
    
    // Traitement spécifique pour app/scopes_update
    if (topic === "app/scopes_update") {
      console.log(`🔄 Mise à jour des scopes pour ${shop}`);
      // Ici tu peux ajouter la logique pour gérer les changements de scopes
      // Par exemple, mettre à jour les permissions en base de données
    }
    
    // Retourner une réponse 200 OK
    return new Response("OK", { 
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
    
  } catch (error) {
    console.error(`❌ Erreur webhook app/scopes_update:`, error);
    
    // Retourner une erreur 500 pour que Shopify retry
    return new Response("Internal Server Error", { 
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
