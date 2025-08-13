import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic } = await authenticate.webhook(request);
    
    console.log(`📡 Webhook received: ${topic} for ${shop}`);
    
    // Specific handling for app/scopes_update
    if (topic === "app/scopes_update") {
      console.log(`🔄 Updating scopes for ${shop}`);
      // Here you can add logic to handle scope changes
      // For example, update permissions in the database
    }
    
    // Return a 200 OK response
    return new Response("OK", { 
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
    
  } catch (error) {
    console.error(`❌ Error webhook app/scopes_update:`, error);
    
    // Return a 500 error so Shopify will retry
    return new Response("Internal Server Error", { 
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
