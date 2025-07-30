import { json, type ActionFunction } from "@remix-run/node";

export const action: ActionFunction = async ({ request }) => {
  const payload = await request.json();
  console.log("🗑️ GDPR Customer Redact:", payload);

  return json({ success: true });
};