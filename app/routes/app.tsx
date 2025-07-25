import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { AppProvider, Card, Page, TextField, Button, BlockStack } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState } from "react";
import { getTranslations } from '../locales/locale';
import polarisEn from "@shopify/polaris/locales/en.json";
import polarisFr from "@shopify/polaris/locales/fr.json";
import polarisEs from "@shopify/polaris/locales/es.json";
import polarisIt from "@shopify/polaris/locales/it.json";
import polarisDe from "@shopify/polaris/locales/de.json";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

function detectLang(request: Request): 'en' | 'fr' | 'es' | 'it' | 'de' {
  const accept = request.headers.get("accept-language") || "";
  const lang = accept.toLowerCase().split(',')[0].split('-')[0];
  if (["fr","es","it","de"].includes(lang)) return lang as 'fr' | 'es' | 'it' | 'de';
  return 'en';
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopifyAccessToken = session.accessToken;
  const shopDomain = session.shop;
  const lang = detectLang(request);
  let polarisTranslations: any = polarisEn;
  if (lang === 'fr') polarisTranslations = polarisFr;
  else if (lang === 'es') polarisTranslations = polarisEs;
  else if (lang === 'it') polarisTranslations = polarisIt;
  else if (lang === 'de') polarisTranslations = polarisDe;
  return json({ shopifyAccessToken, shopDomain, lang, polarisTranslations });
};

export default function App() {
  const { shopifyAccessToken, shopDomain, lang, polarisTranslations } = useLoaderData<typeof loader>();
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedShop, setCopiedShop] = useState(false);
  const t = getTranslations(lang);

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
    <AppProvider i18n={polarisTranslations}>
      <Page title={t.pageTitle}>
        <Card>
          <BlockStack gap="400">
            <TextField
              label={t.accessTokenLabel}
              value={shopifyAccessToken || ""}
              readOnly
              autoComplete="off"
              helpText={t.accessTokenHelp}
            />
            <Button onClick={handleCopyToken} variant="primary" disabled={!shopifyAccessToken}>
              {copiedToken ? t.copiedToken : t.copyToken}
            </Button>
            <TextField
              label={t.shopDomainLabel}
              value={shopDomain || ""}
              readOnly
              autoComplete="off"
              helpText={t.shopDomainHelp}
            />
            <Button onClick={handleCopyShop} variant="primary" disabled={!shopDomain}>
              {copiedShop ? t.copiedShop : t.copyShop}
            </Button>
          </BlockStack>
        </Card>
      </Page>
    </AppProvider>
  );
}
