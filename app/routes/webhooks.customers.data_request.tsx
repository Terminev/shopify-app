import { json, type ActionFunction } from "@remix-run/node";

export const action: ActionFunction = async ({ request }) => {
  const payload = await request.json();
  console.log("📄 GDPR Data Request:", payload);

  return json({ success: true });
};