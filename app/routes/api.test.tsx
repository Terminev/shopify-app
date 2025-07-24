import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Appeler l'API publique
  const apiUrl = new URL(request.url);
  const baseUrl = `${apiUrl.protocol}//${apiUrl.host}`;
  const token = session.accessToken;
  
  try {
    const response = await fetch(`${baseUrl}/api/products/public?token=${token}`);
    const data = await response.json();
    
    return json({ 
      success: true, 
      apiResponse: data,
      token: token.substring(0, 10) + "..."
    });
  } catch (error) {
    return json({ 
      success: false, 
      error: error.message 
    });
  }
};

export default function TestPage() {
  const { success, apiResponse, token, error } = useLoaderData<typeof loader>();
  
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Test API Publique</h1>
      <p><strong>Token:</strong> {token}</p>
      <p><strong>Status:</strong> {success ? '✅ Succès' : '❌ Erreur'}</p>
      
      {success ? (
        <div>
          <h2>Réponse API :</h2>
          <pre style={{ 
            background: '#f5f5f5', 
            padding: '15px', 
            borderRadius: '5px',
            overflow: 'auto',
            maxHeight: '500px'
          }}>
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </div>
      ) : (
        <div>
          <h2>Erreur :</h2>
          <pre style={{ color: 'red' }}>{error}</pre>
        </div>
      )}
    </div>
  );
} 