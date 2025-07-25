export async function getShopifyAdminFromToken(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const shopDomain = url.searchParams.get("shop");
  if (!token) {
    return { error: { status: 401, message: "Token d'authentification requis. Utilisez ?token=VOTRE_TOKEN" } };
  }
  if (!token.startsWith("shpua_")) {
    return { error: { status: 401, message: "Format de token invalide. Le token doit commencer par 'shpua_'" } };
  }
  if (!shopDomain) {
    return { error: { status: 400, message: "Paramètre 'shop' requis dans l'URL (?shop=shopDomain)" } };
  }
  const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;

  // Vérification du token par une requête test
  const testQuery = `{ shop { id } }`;
  const resp = await fetch(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: testQuery }),
  });
  if (!resp.ok) {
    return { error: { status: resp.status, message: "Token Shopify invalide ou expiré" } };
  }

  return { token, shopDomain, adminUrl };
} 