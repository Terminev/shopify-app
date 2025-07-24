import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { AppProvider, Card, Page, TextField, Button, BlockStack } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState } from "react";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopifyAccessToken = session.accessToken;
  const shopifyApiKey = process.env.SHOPIFY_API_KEY || "";
  return json({ shopifyAccessToken, shopifyApiKey, shop: session.shop });
};

export default function App() {
  const { shopifyAccessToken, shopifyApiKey } = useLoaderData<typeof loader>();
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);

  const handleCopyToken = () => {
    if (shopifyAccessToken) {
      navigator.clipboard.writeText(shopifyAccessToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 1500);
    }
  };

  const handleCopyApiKey = () => {
    if (shopifyApiKey) {
      navigator.clipboard.writeText(shopifyApiKey);
      setCopiedApiKey(true);
      setTimeout(() => setCopiedApiKey(false), 1500);
    }
  };

  return (
    <AppProvider i18n={{}}>
      <Page title="Clés Shopify">
        <Card>
          <BlockStack gap="400">
            <TextField
              label="Access Token Shopify"
              value={shopifyAccessToken || ""}
              readOnly
              autoComplete="off"
              helpText="Token d'accès pour l'API Shopify (sha_...)"
            />
            <Button onClick={handleCopyToken} variant="primary" disabled={!shopifyAccessToken}>
              {copiedToken ? "Copié !" : "Copier le token"}
            </Button>
            <TextField
              label="API Key Shopify"
              value={shopifyApiKey || ""}
              readOnly
              autoComplete="off"
              helpText="Clé API de l'application Shopify"
            />
            <Button onClick={handleCopyApiKey} variant="primary" disabled={!shopifyApiKey}>
              {copiedApiKey ? "Copié !" : "Copier la clé API"}
            </Button>
          </BlockStack>
        </Card>
      </Page>
    </AppProvider>
  );
}
