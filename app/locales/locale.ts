const translations = {
  en: {
    accessTokenLabel: "Shopify Access Token",
    accessTokenHelp: "Access token for the Shopify API to use in the Upsellr app",
    copyToken: "Copy token",
    copiedToken: "Copied!",
    shopDomainLabel: "Shop Domain",
    shopDomainHelp: "Shop domain to use in the Upsellr app",
    copyShop: "Copy domain",
    copiedShop: "Copied!",
    pageTitle: "Shopify Keys"
  },
  fr: {
    accessTokenLabel: "Access Token Shopify",
    accessTokenHelp: "Token d'accès pour l'API Shopify à renseigner dans l'app Upsellr",
    copyToken: "Copier le token",
    copiedToken: "Copié !",
    shopDomainLabel: "Nom de la boutique Shopify",
    shopDomainHelp: "Domaine de la boutique à renseigner dans l'app Upsellr",
    copyShop: "Copier le domaine",
    copiedShop: "Copié !",
    pageTitle: "Clés Shopify"
  },
  es: {
    accessTokenLabel: "Token de acceso de Shopify",
    accessTokenHelp: "Token de acceso para la API de Shopify a usar en la app Upsellr",
    copyToken: "Copiar token",
    copiedToken: "¡Copiado!",
    shopDomainLabel: "Dominio de la tienda",
    shopDomainHelp: "Dominio de la tienda para usar en la app Upsellr",
    copyShop: "Copiar dominio",
    copiedShop: "¡Copiado!",
    pageTitle: "Claves de Shopify"
  },
  it: {
    accessTokenLabel: "Token di accesso Shopify",
    accessTokenHelp: "Token di accesso per l'API Shopify da usare nell'app Upsellr",
    copyToken: "Copia token",
    copiedToken: "Copiato!",
    shopDomainLabel: "Dominio del negozio",
    shopDomainHelp: "Dominio del negozio da usare nell'app Upsellr",
    copyShop: "Copia dominio",
    copiedShop: "Copiato!",
    pageTitle: "Chiavi Shopify"
  },
  de: {
    accessTokenLabel: "Shopify-Zugangstoken",
    accessTokenHelp: "Zugangstoken für die Shopify-API zur Verwendung in der Upsellr-App",
    copyToken: "Token kopieren",
    copiedToken: "Kopiert!",
    shopDomainLabel: "Shop-Domain",
    shopDomainHelp: "Shop-Domain zur Verwendung in der Upsellr-App",
    copyShop: "Domain kopieren",
    copiedShop: "Kopiert!",
    pageTitle: "Shopify-Schlüssel"
  }
};

type Lang = 'en' | 'fr' | 'es' | 'it' | 'de';

export function getTranslations(lang: string) {
  const safeLang: Lang = ['fr','es','it','de'].includes(lang) ? lang as Lang : 'en';
  return translations[safeLang];
} 