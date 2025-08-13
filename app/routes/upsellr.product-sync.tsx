import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { DataService } from "../utils/data-service";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json();
    const { shopId, shopifyProductId, saasProductId, syncDirection } = body;
    
    if (!shopId || !shopifyProductId || !syncDirection) {
      return json({ 
        success: false, 
        error: "Missing parameters: shopId, shopifyProductId, and syncDirection are required" 
      }, { status: 400 });
    }
    
    const dataService = DataService.getInstance();
    
    // Save the synchronized product
    await dataService.createProductSync(
      shopId,
      shopifyProductId,
      saasProductId,
      syncDirection as 'shopify_to_saas' | 'saas_to_shopify'
    );
    
    console.log(`✅ Synced product saved: ${shopifyProductId} - ${syncDirection}`);
    
    return json({
      success: true,
      message: "Synchronized product saved"
    });
    
  } catch (error) {
    console.error("❌ Error while saving the synced product:", error);
    return json({ 
      success: false, 
      error: "Internal error" 
    }, { status: 500 });
  }
}; 