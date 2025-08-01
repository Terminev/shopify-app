import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";
import { 
  parseProductFilters, 
  buildShopifyQuery, 
  getAllProductsWithPagination, 
  applyNodeSideFilters,
  getCategoryMetaSuggestions
} from "../utils/shopify-filters";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json({ success: false, error: shopifyAuth.error.message }, { status: shopifyAuth.error.status });
  }
  const { token, adminUrl } = shopifyAuth;

  const url = new URL(request.url);
  const params = url.searchParams;
  const categoryName = params.get('category');
  const minFrequency = parseFloat(params.get('min_frequency') || '0.1'); // Fréquence minimale pour inclure une suggestion

  if (!categoryName) {
    return json({ success: false, error: "Le paramètre 'category' est requis" }, { status: 400 });
  }

  // Récupérer tous les produits avec leurs métadonnées
  const filters = parseProductFilters(request);
  const shopifyQuery = buildShopifyQuery(filters);
  let products = await getAllProductsWithPagination(adminUrl, token, shopifyQuery, true);
  products = applyNodeSideFilters(products, filters);

  // Filtrer les produits de la catégorie demandée
  const categoryProducts = products.filter(product => 
    product.category?.name === categoryName
  );
  
  if (categoryProducts.length === 0) {
    return json({ 
      success: false, 
      error: `Aucun produit trouvé pour la catégorie '${categoryName}'` 
    }, { status: 404 });
  }

  // Récupérer les suggestions
  const suggestions = getCategoryMetaSuggestions(products, categoryName);
  
  // Filtrer par fréquence minimale
  const filteredSuggestions = suggestions.filter(suggestion => 
    suggestion.frequency >= minFrequency
  );

  return json({
    success: true,
    category: categoryName,
    products_count: categoryProducts.length,
    suggestions_count: filteredSuggestions.length,
    min_frequency: minFrequency,
    suggestions: filteredSuggestions.map(suggestion => ({
      namespace: suggestion.namespace,
      key: suggestion.key,
      type: suggestion.type,
      frequency: suggestion.frequency,
      frequency_percentage: Math.round(suggestion.frequency * 100),
      values: suggestion.values,
      values_count: suggestion.values.length
    }))
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}; 