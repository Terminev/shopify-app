import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";
import { DataService } from "../utils/data-service";
// @ts-ignore
import pkg from '../../package.json';

export const action = async ({ request }: ActionFunctionArgs) => {
  // On lit shop et token dans l'URL (query params), même en POST
  const shopifyAuth = await getShopifyAdminFromToken(request);
  // @ts-ignore
  const version = pkg.version || '1.0.0';
  
  if (shopifyAuth.error) {
    return json({ success: false, error: shopifyAuth.error.message, version }, { status: shopifyAuth.error.status });
  }
  
  const { token, shopDomain } = shopifyAuth;
  const dataService = DataService.getInstance();
  
  try {
    // Extraire l'ID du shop depuis le domaine
    const shopId = `gid://shopify/Shop/${shopDomain.split('.')[0]}`;
    const shopUrl = `https://${shopDomain}`;
    
    // Enregistrer la connexion boutique en base
    await dataService.createShopConnection(shopId, shopDomain, shopUrl, token);
    
    console.log(`✅ Connexion enregistrée pour ${shopDomain}`);
    
    return json({
      success: 'ok',
      shopDomain,
      shopId,
      token,
      version
    });
    
  } catch (error) {
    console.error(`❌ Erreur lors de l'enregistrement de la connexion:`, error);
    
    // On retourne quand même les données même si l'enregistrement échoue
    return json({
      success: 'ok',
      shopDomain,
      token,
      version,
      warning: 'Connexion établie mais enregistrement échoué'
    });
  }
};