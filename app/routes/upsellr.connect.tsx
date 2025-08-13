import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";
import { DataService } from "../utils/data-service";
// @ts-ignore
import pkg from '../../package.json';

export const action = async ({ request }: ActionFunctionArgs) => {
  // Read shop and token from the URL (query params)
  const shopifyAuth = await getShopifyAdminFromToken(request);
  // @ts-ignore
  const version = pkg.version || '1.0.0';
  
  if (shopifyAuth.error) {
    return json({ success: false, error: shopifyAuth.error.message, version }, { status: shopifyAuth.error.status });
  }
  
  const { token, shopDomain } = shopifyAuth;
  const dataService = DataService.getInstance();
  
  try {
    // Extract the shop ID from the domain
    const shopId = `gid://shopify/Shop/${shopDomain.split('.')[0]}`;
    const shopUrl = `https://${shopDomain}`;
    
    // Save the shop connection in the database
    await dataService.createShopConnection(shopId, shopDomain, shopUrl, token);
    
    console.log(`✅ Connection saved for ${shopDomain}`);
    
    return json({
      success: 'ok',
      shopDomain,
      shopId,
      token,
      version
    });
    
  } catch (error) {
    console.error(`❌ Error while saving the connection:`, error);
    
    // Return the data anyway even if saving fails
    return json({
      success: 'ok',
      shopDomain,
      token,
      version,
      warning: 'Connection established but saving failed'
    });
  }
};