import "@shopify/shopify-app-remix/adapters/node";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import dotenv from "dotenv";
import { parse } from "toml";
import { readFileSync } from "fs";
import { join } from "path";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

// Charger le fichier de configuration Shopify approprié
const configFile = process.env.SHOPIFY_CONFIG_FILE || "shopify.app.toml";
const configPath = join(process.cwd(), configFile);
let shopifyConfig;

try {
  const configContent = readFileSync(configPath, "utf-8");
  shopifyConfig = parse(configContent);
} catch (error) {
  shopifyConfig = null;
}

const apiKey = shopifyConfig?.client_id || process.env.SHOPIFY_API_KEY || "";
const apiSecretKey = process.env.SHOPIFY_API_SECRET_KEY || "";
const appUrl = shopifyConfig?.application_url || process.env.SHOPIFY_APP_URL || "https://plugin.upsellr.io";
const scopes = shopifyConfig?.access_scopes?.scopes?.split(",").map((s: string) => s.trim()) || ["read_metaobject_definitions", "read_metaobjects", "write_products"];

console.log(`🔑 API Key: ${apiKey}`);
console.log(`🔐 API Secret Key: ${apiSecretKey ? "***" : "NON DÉFINI"}`);
console.log(`🌐 App URL: ${appUrl}`);
console.log(`📋 Scopes: ${scopes.join(", ")}`);

const shopify = shopifyApp({
  apiKey,
  apiSecretKey,
  apiVersion: ApiVersion.January25,
  scopes,
  appUrl,
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
