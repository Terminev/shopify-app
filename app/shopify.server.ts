import "@shopify/shopify-app-remix/adapters/node";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "2022322134db5403bdd40384bf020a5c",
  apiSecretKey: process.env.SHOPIFY_API_SECRET_KEY || "b886cee6f55b061de5c997236723da9f",
  apiVersion: ApiVersion.January25,
  scopes: ["read_metaobjects"],
  appUrl: "https://plugin.upsellr.io",
  authPathPrefix: "/auth",
  distribution: AppDistribution.AppStore,
  sessionStorage: new MemorySessionStorage(),
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;