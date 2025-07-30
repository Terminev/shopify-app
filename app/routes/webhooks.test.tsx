import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { DataService } from "../utils/data-service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const dataService = DataService.getInstance();
  
  // Simuler des données de test
  const testCustomerId = "gid://shopify/Customer/123456789";
  const testShopId = "gid://shopify/Shop/987654321";
  
  try {
    // Test 1: Récupérer les données de connexion boutique
    console.log("🧪 Test 1: Récupération données connexion boutique");
    const shopConnection = await dataService.getShopConnection(testShopId);
    
    // Test 2: Récupérer les logs de synchronisation
    console.log("🧪 Test 2: Récupération logs de synchronisation");
    const syncLogs = await dataService.getSyncLogs(testShopId);
    
    // Test 3: Récupérer les données de produits synchronisés
    console.log("🧪 Test 3: Récupération données produits synchronisés");
    const productData = await dataService.getProductSyncData(testShopId);
    
    // Test 4: Générer un rapport GDPR
    console.log("🧪 Test 4: Génération rapport GDPR");
    const gdprReport = await dataService.generateGDPRReport(testCustomerId, testShopId);
    
    return json({
      success: true,
      tests: {
        shop_connection: shopConnection,
        sync_logs: syncLogs,
        product_sync_data: productData,
        gdpr_report: gdprReport
      },
      message: "Tests des webhooks de conformité pour ton app de synchronisation terminés"
    });
    
  } catch (error) {
    console.error("❌ Erreur lors des tests:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue"
    }, { status: 500 });
  }
}; 