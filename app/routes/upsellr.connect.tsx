import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";
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
  return json({
    success: 'ok',
    shopDomain,
    token,
    version
  });
};