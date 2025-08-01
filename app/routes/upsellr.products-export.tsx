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

  // Pagination dynamique
  const url = new URL(request.url);
  const params = url.searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10));
  const pageSize = Math.max(1, Math.min(250, parseInt(params.get('page_size') || '250', 10)));
  const excludeMetaTaxonomies = params.get('exclude_meta_taxonomies') === 'true';
  const totalProductsRest = products.length;
  const pageCount = Math.max(1, Math.ceil(totalProductsRest / pageSize));
  const paginatedProducts = products.slice((page - 1) * pageSize, page * pageSize);

  // Transformer les produits pour ne garder que les champs essentiels
  const simplifiedProducts = paginatedProducts.map((product: any) => {
    // Extraire les métadonnées essentielles
    const metafields = product.metafields?.edges?.map((edge: any) => edge.node) || [];
    const shortDescription = metafields.find((m: any) => m.key === 'short_description' && m.namespace === 'custom')?.value;
    const technicalSpecs = metafields.find((m: any) => m.key === 'technical' && m.namespace === 'specs')?.value;
    
    // Extraire les variantes (SKU, barcode)
    const variants = product.variants?.edges?.map((edge: any) => edge.node) || [];
    const firstVariant = variants[0] || {};
    
    // Extraire les meta taxonomies de catégorie (champs automatiques)
    const categoryMetaFields = metafields.filter((m: any) => 
      m.namespace === 'shopify' && 
      (m.key.includes('color') || m.key.includes('format') || m.key.includes('resolution') || 
       m.key.includes('connection') || m.key.includes('system') || m.key.includes('power') ||
       m.key.includes('efficiency') || m.key.includes('compatible'))
    );

    const simplifiedProduct: any = {
      id: product.id,
      title: product.title,
      description: product.description,
      short_description: shortDescription,
      meta_title: product.seo?.title,
      meta_description: product.seo?.description,
      specifications: technicalSpecs ? JSON.parse(technicalSpecs) : null,
      vendor: product.vendor,
      sku: firstVariant.sku,
      barcode: firstVariant.barcode,
      category: {
        id: product.category?.id,
        name: product.category?.name
      },
      // Meta taxonomies de catégorie (champs automatiques)
      category_meta_fields: categoryMetaFields.map((m: any) => ({
        key: m.key,
        value: m.value,
        type: m.type,
        namespace: m.namespace
      }))
    };

    // Ajouter les meta taxonomies résolues si demandé
    if (!excludeMetaTaxonomies) {
      simplifiedProduct.meta_taxonomies = getProductMetaTaxonomies(product, adminUrl, token);
    }

    return simplifiedProduct;
  });

  return json({
    stats: {
      page,
      page_count: pageCount,
      page_size: pageSize,
      total_products: totalProductsRest
    },
    products: simplifiedProducts
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}; 
