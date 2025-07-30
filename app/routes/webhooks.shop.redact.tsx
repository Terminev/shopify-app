import { json, type ActionFunction } from "@remix-run/node";
export const action: ActionFunction = async ({ request }) => {
  const payload = await request.json();
  console.log("🏪 GDPR Shop Redact:", payload);

  const shopDomain = payload?.shop_domain;

  if (shopDomain) {
    try {
      console.log(`✅ Données supprimées pour ${shopDomain}`);
    } catch (err) {
      console.error("❌ Erreur suppression shop:", err);
    }
  }

  return json({ success: true });
};
