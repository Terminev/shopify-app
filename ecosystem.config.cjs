require("dotenv").config();

module.exports = {
  apps: [
    // Production
    {
      name: "nodeApp",
      script: "npm",
      args: "run start",
      env: {
        SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
        SHOPIFY_API_SECRET_KEY: process.env.SHOPIFY_API_SECRET_KEY,
        SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
        SHOP_CUSTOM_DOMAIN: process.env.SHOP_CUSTOM_DOMAIN,
        HOST: "127.0.0.1",
        APP_URL: process.env.APP_URL,
        NODE_ENV: "production",
        PORT: "3000",
      },
    },

    // Développement
    {
      name: "nodeApp-dev",
      script: "npm",
      args: "run start",
      env: {
        SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY_DEV,
        SHOPIFY_API_SECRET_KEY: process.env.SHOPIFY_API_SECRET_KEY_DEV,
        SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL_DEV,
        SHOP_CUSTOM_DOMAIN: process.env.SHOP_CUSTOM_DOMAIN_DEV,
        HOST: "127.0.0.1",
        PORT: "3000",
        APP_URL: process.env.APP_URL_DEV,
        NODE_ENV: "production",
        SHOPIFY_CONFIG_FILE: "shopify.app.upsellr-connector-dev.toml",
      },
    },
  ],
};
