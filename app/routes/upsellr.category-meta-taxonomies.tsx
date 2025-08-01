import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";
import { 
  parseProductFilters, 
  buildShopifyQuery, 
  getAllProductsWithPagination, 
  applyNodeSideFilters,
  extractCategoryMetaTaxonomies,
  getCategoryMetaSuggestions,
  getProductMetaTaxonomies
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
  const productId = params.get('product_id');
  const includeSuggestions = params.get('include_suggestions') === 'true';

  // Récupérer tous les produits avec leurs métadonnées
  const filters = parseProductFilters(request);
  const shopifyQuery = buildShopifyQuery(filters);
  let products = await getAllProductsWithPagination(adminUrl, token, shopifyQuery, true);
  products = applyNodeSideFilters(products, filters);

  // Si on demande un produit spécifique
  if (productId) {
    const product = products.find(p => p.id === productId);
    if (!product) {
      return json({ success: false, error: "Produit non trouvé" }, { status: 404 });
    }
    
    const productTaxonomies = getProductMetaTaxonomies(product);
    return json({
      success: true,
      product_id: productId,
      category: product.category?.name,
      meta_taxonomies: productTaxonomies
    });
  }

  // Si on demande une catégorie spécifique
  if (categoryName) {
    const categoryProducts = products.filter(product => 
      product.category?.name === categoryName
    );
    
    if (categoryProducts.length === 0) {
      return json({ success: false, error: "Catégorie non trouvée" }, { status: 404 });
    }

    const categoryTaxonomies = extractCategoryMetaTaxonomies(categoryProducts);
    const result: any = {
      success: true,
      category: categoryName,
      products_count: categoryProducts.length,
      meta_taxonomies: categoryTaxonomies[categoryName] || []
    };

    if (includeSuggestions) {
      result.suggestions = getCategoryMetaSuggestions(products, categoryName);
    }

    return json(result);
  }

  // Sinon, retourner toutes les meta taxonomies par catégorie
  const allCategoryTaxonomies = extractCategoryMetaTaxonomies(products);
  
  // Compter les produits par catégorie
  const categoryStats: { [categoryName: string]: number } = {};
  products.forEach(product => {
    const categoryName = product.category?.name;
    if (categoryName) {
      categoryStats[categoryName] = (categoryStats[categoryName] || 0) + 1;
    }
  });

  const result = {
    success: true,
    total_products: products.length,
    categories: Object.keys(allCategoryTaxonomies).map(categoryName => ({
      name: categoryName,
      products_count: categoryStats[categoryName] || 0,
      meta_taxonomies: allCategoryTaxonomies[categoryName]
    }))
  };

  if (includeSuggestions) {
    result.suggestions = {};
    Object.keys(allCategoryTaxonomies).forEach(categoryName => {
      result.suggestions[categoryName] = getCategoryMetaSuggestions(products, categoryName);
    });
  }

  return json(result, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}; 