import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";
import { parseProductFilters, buildShopifyQuery, getAllProductsWithPagination, applyNodeSideFilters, getProductMetaTaxonomies } from "../utils/shopify-filters";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json({ success: false, error: shopifyAuth.error.message }, { status: shopifyAuth.error.status });
  }
  const { token, adminUrl } = shopifyAuth;

  const filters = parseProductFilters(request);
  const shopifyQuery = buildShopifyQuery(filters);
  let products = await getAllProductsWithPagination(adminUrl, token, shopifyQuery, true);
  products = applyNodeSideFilters(products, filters);

  // Pagination dynamique (reprend la logique précédente)
  const url = new URL(request.url);
  const params = url.searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10));
  const pageSize = Math.max(1, Math.min(250, parseInt(params.get('page_size') || '250', 10)));
  const excludeMetaTaxonomies = params.get('exclude_meta_taxonomies') === 'true';
  const totalProductsRest = products.length;
  const pageCount = Math.max(1, Math.ceil(totalProductsRest / pageSize));
  const paginatedProducts = products.slice((page - 1) * pageSize, page * pageSize);

  // Ajouter les meta taxonomies par défaut (sauf si explicitement exclu)
  if (!excludeMetaTaxonomies) {
    const skipMetaobjectResolution = params.get('skip_metaobject_resolution') === 'true';
    
    for (const product of paginatedProducts) {
      product.meta_taxonomies = await getProductMetaTaxonomies(product, adminUrl, token, skipMetaobjectResolution);
    }
  }

  return json({
    stats: {
      page,
      page_count: pageCount,
      page_size: pageSize,
      total_products: totalProductsRest
    },
    products: paginatedProducts
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}; 
