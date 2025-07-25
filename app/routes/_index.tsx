import { json, LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Card, Page, TextField } from "@shopify/polaris";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";

export const loader: LoaderFunction = async ({ request }) => {
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    throw new Response(shopifyAuth.error.message, { status: shopifyAuth.error.status });
  }
  return json({ shopifyToken: shopifyAuth.token });
};

export default function Index() {
  const { shopifyToken } = useLoaderData<typeof loader>();

  return (
    <Page title="Clé Shopify transmise">
      <Card>
        <TextField
          label="Clé Shopify reçue"
          value={shopifyToken}
          readOnly
          autoComplete="off"
        />
      </Card>
    </Page>
  );
}
