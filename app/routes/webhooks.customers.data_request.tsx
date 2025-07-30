import { json, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  
  const payload = await request.json();
  console.log("📄 GDPR Data Request:", payload);

  // Aucun stockage client → 200 OK
  return json({ success: true });
};