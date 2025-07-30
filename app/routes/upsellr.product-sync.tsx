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
        error: "Paramètres manquants: shopId, shopifyProductId, syncDirection requis" 
      }, { status: 400 });
    }
    
    const dataService = DataService.getInstance();
    
    // Enregistrer le produit synchronisé
    await dataService.createProductSync(
      shopId,
      shopifyProductId,
      saasProductId,
      syncDirection as 'shopify_to_saas' | 'saas_to_shopify'
    );
    
    console.log(`✅ Produit sync enregistré: ${shopifyProductId} - ${syncDirection}`);
    
    return json({
      success: true,
      message: "Produit synchronisé enregistré"
    });
    
  } catch (error) {
    console.error("❌ Erreur lors de l'enregistrement du produit sync:", error);
    return json({ 
      success: false, 
      error: "Erreur interne" 
    }, { status: 500 });
  }
}; 