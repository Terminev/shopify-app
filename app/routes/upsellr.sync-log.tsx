import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { DataService } from "../utils/data-service";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json();
    const { shopId, syncType, productsCount, status, errorMessage } = body;
    
    if (!shopId || !syncType || !productsCount || !status) {
      return json({ 
        success: false, 
        error: "Missing parameters: shopId, syncType, productsCount, status required" 
      }, { status: 400 });
    }
    
    const dataService = DataService.getInstance();
    
    // Save the synchronization log
    await dataService.createSyncLog(
      shopId,
      syncType as 'import' | 'export',
      productsCount,
      status as 'success' | 'error' | 'partial',
      errorMessage
    );
    
    console.log(`✅ Sync log saved: ${syncType} - ${productsCount} products - ${status}`);
    
    return json({
      success: true,
      message: "Synchronization log saved"
    });
    
  } catch (error) {
    console.error("❌ Error while saving sync log:", error);
    return json({ 
      success: false, 
      error: "Internal error" 
    }, { status: 500 });
  }
}; 