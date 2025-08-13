export async function getShopifyAdminFromToken(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const shopDomain = url.searchParams.get("shop");
  if (!token) {
    return { error: { status: 401, message: "Authentication token required. Use ?token=YOUR_TOKEN" } };
  }
  if (!shopDomain) {
    return { error: { status: 400, message: "Required parameter 'shop' in URL (?shop=shopDomain)" } };
  }
  const adminUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;

  // Test token validity
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
    return { error: { status: resp.status, message: "Invalid or expired Shopify token" } };
  }

  return { token, shopDomain, adminUrl };
} 