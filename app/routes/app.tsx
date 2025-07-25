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
  const shopDomain = session.shop;
  return json({ shopifyAccessToken, shopDomain });
};

export default function App() {
  const { shopifyAccessToken, shopDomain } = useLoaderData<typeof loader>();
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedShop, setCopiedShop] = useState(false);

  const handleCopyToken = () => {
    if (shopifyAccessToken) {
      navigator.clipboard.writeText(shopifyAccessToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 1500);
    }
  };

  const handleCopyShop = () => {
    if (shopDomain) {
      navigator.clipboard.writeText(shopDomain);
      setCopiedShop(true);
      setTimeout(() => setCopiedShop(false), 1500);
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
              helpText="Token d'accès pour l'API Shopify à renseigner dans l'app Upsellr"
            />
            <Button onClick={handleCopyToken} variant="primary" disabled={!shopifyAccessToken}>
              {copiedToken ? "Copié !" : "Copier le token"}
            </Button>
            <TextField
              label="Nom de la boutique Shopify"
              value={shopDomain || ""}
              readOnly
              autoComplete="off"
              helpText="Domaine de la boutique à renseigner dans l'app Upsellr"
            />
            <Button onClick={handleCopyShop} variant="primary" disabled={!shopDomain}>
              {copiedShop ? "Copié !" : "Copier le domaine"}
            </Button>
          </BlockStack>
        </Card>
      </Page>
    </AppProvider>
  );
}
