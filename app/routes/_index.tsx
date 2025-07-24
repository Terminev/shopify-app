import { json, LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Card, Page, TextField } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrCreateShopifyToken } from "../db/shop-settings.server";

export const loader: LoaderFunction = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopifyToken = await getOrCreateShopifyToken(session.shop);
  return json({ shopifyToken });
};

export default function Index() {
  const { shopifyToken } = useLoaderData<typeof loader>();

  return (
    <Page title="Clé générée pour Shopify">
      <Card>
        <TextField
          label="Clé unique générée"
          value={shopifyToken}
          readOnly
          autoComplete="off"
        />
      </Card>
    </Page>
  );
}
