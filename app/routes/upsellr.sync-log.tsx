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
        error: "Paramètres manquants: shopId, syncType, productsCount, status requis" 
      }, { status: 400 });
    }
    
    const dataService = DataService.getInstance();
    
    // Enregistrer le log de synchronisation
    await dataService.createSyncLog(
      shopId,
      syncType as 'import' | 'export',
      productsCount,
      status as 'success' | 'error' | 'partial',
      errorMessage
    );
    
    console.log(`✅ Log de sync enregistré: ${syncType} - ${productsCount} produits - ${status}`);
    
    return json({
      success: true,
      message: "Log de synchronisation enregistré"
    });
    
  } catch (error) {
    console.error("❌ Erreur lors de l'enregistrement du log de sync:", error);
    return json({ 
      success: false, 
      error: "Erreur interne" 
    }, { status: 500 });
  }
}; 