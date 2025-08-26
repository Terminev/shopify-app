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

// Function to get shop language from Shopify API
async function getShopLanguage(adminUrl: string, token: string): Promise<string> {
  try {
    const query = `
      query {
        shop {
          primaryDomain {
            locale
          }
        }
      }
    `;

    const response = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return 'en';
    }

    const data = await response.json();
    if (data.errors) {
      return 'en';
    }

    return data.data?.shop?.primaryDomain?.locale || 'en';
  } catch (error) {
    console.error('❌ Error while retrieving shop language:', error);
    return 'en';
  }
}

function mapShopifyLocaleToLang(locale: string): 'en' | 'fr' | 'es' | 'it' | 'de' {
  const lang = locale.toLowerCase().split('-')[0];
  if (["fr","es","it","de"].includes(lang)) return lang as 'fr' | 'es' | 'it' | 'de';
  return 'en';
}

// Function to detect user interface language from URL parameters
function detectUserLanguage(request: Request): 'en' | 'fr' | 'es' | 'it' | 'de' {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale');
  
  // Si on a un paramètre locale dans l'URL, on l'utilise
  if (locale) {
    const lang = locale.toLowerCase().split('-')[0];
    if (["fr","es","it","de"].includes(lang)) return lang as 'fr' | 'es' | 'it' | 'de';
    return 'en';
  }
  
  // Fallback sur l'en-tête Accept-Language
  const accept = request.headers.get("accept-language") || "";
  const lang = accept.toLowerCase().split(',')[0].split('-')[0];
  if (["fr","es","it","de"].includes(lang)) return lang as 'fr' | 'es' | 'it' | 'de';
  return 'en';
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shopifyAccessToken = session.accessToken;
    const shopDomain = session.shop;
    
    // Priorité 1: Langue de l'interface utilisateur (Accept-Language header)
    // Priorité 2: Langue de la boutique Shopify (fallback)
    let lang: 'en' | 'fr' | 'es' | 'it' | 'de' = detectUserLanguage(request);
    
    // Si on a accès à l'API Shopify, on peut utiliser la langue de la boutique comme fallback
    if (shopDomain && shopifyAccessToken) {
      try {
        const adminUrl = `https://${shopDomain}/admin/api/2025-07/graphql.json`;
        const shopifyLocale = await getShopLanguage(adminUrl, shopifyAccessToken);
        const shopLang = mapShopifyLocaleToLang(shopifyLocale);
        
        // Si la langue utilisateur est l'anglais (défaut), on utilise la langue de la boutique
        if (lang === 'en' && shopLang !== 'en') {
          lang = shopLang;
        }
      } catch (error) {
        console.error('❌ Error getting shop language, using user language:', error);
      }
    }
    
    let polarisTranslations: any = polarisEn;
    if (lang === 'fr') polarisTranslations = polarisFr;
    else if (lang === 'es') polarisTranslations = polarisEs;
    else if (lang === 'it') polarisTranslations = polarisIt;
    else if (lang === 'de') polarisTranslations = polarisDe;
    
    return json({ shopifyAccessToken, shopDomain, lang, polarisTranslations });
  } catch (error) {
    console.error('❌ Authentication error:', error);
    // En cas d'erreur d'authentification, rediriger vers la page de login
    throw new Response("Authentication required", { 
      status: 401,
      headers: {
        "Location": "/auth/login"
      }
    });
  }
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
