import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Utiliser l'access token Shopify natif
  const shopifyAccessToken = session.accessToken;
  
  // Récupérer la clé API depuis la configuration
  const shopifyApiKey = "01268dbdf25ab38ac2fac9c07d8fcc0a"; // client_id from shopify.app.toml

  // Récupérer les produits Shopify (pour la suite, mais pas affiché ici)
  const productsResponse = await admin.graphql(
    `#graphql
      query getProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              status
              totalInventory
              createdAt
              updatedAt
            }
          }
        }
      }`,
    {
      variables: { first: 50 },
    }
  );

  const productsData = await productsResponse.json();
  const products = productsData.data.products.edges.map((edge: any) => edge.node);

  return json({ 
    products,
    shopifyAccessToken,
    shopifyApiKey
  });
};

export default function Index() {
  const { shopifyAccessToken, shopifyApiKey } = useLoaderData<typeof loader>();
  const [copied, setCopied] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  
  const handleCopy = () => {
    if (shopifyAccessToken) {
      navigator.clipboard.writeText(shopifyAccessToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
    <Page>
      <TitleBar title="Upsellr Connector" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Clés de connexion Shopify
              </Text>
              
              <TextField
                label="Access Token Shopify"
                value={shopifyAccessToken || ""}
                readOnly
                autoComplete="off"
                helpText="Token d'accès pour l'API Shopify"
              />
              <Button variant="primary" onClick={handleCopy} disabled={!shopifyAccessToken}>
                {copied ? "Copié !" : "Copier le token"}
              </Button>
              
              <TextField
                label="API Key Shopify"
                value={shopifyApiKey || ""}
                readOnly
                autoComplete="off"
                helpText="Clé API pour identifier l'application"
              />
              <Button variant="primary" onClick={handleCopyApiKey} disabled={!shopifyApiKey}>
                {copiedApiKey ? "Copié !" : "Copier la clé API"}
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

