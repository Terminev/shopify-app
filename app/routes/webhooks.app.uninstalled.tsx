import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic } = await authenticate.webhook(request);
    
    console.log(`📡 Webhook received: ${topic} for ${shop}`);
    
    // Specific handling for app/uninstalled
    if (topic === "app/uninstalled") {
      console.log(`🗑️ App uninstalled for ${shop}`);
    }
    
    // Return a 200 OK response
    return new Response("OK", { 
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
    
  } catch (error) {
    console.error(`❌ Error webhook app/uninstalled:`, error);
    
    // Return a 500 error so Shopify will retry
    return new Response("Internal Server Error", { 
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
