import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getShopifyAdminFromToken } from "../utils/shopify-auth";
import {
  parseProductFilters,
  buildShopifyQuery,
  getAllProductsWithPagination,
  applyNodeSideFilters,
  getProductMetaTaxonomies,
  getMetaobjectDefinitions,
  enrichMetaFieldsWithDefinitions,
} from "../utils/shopify-filters";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopifyAuth = await getShopifyAdminFromToken(request);
  if (shopifyAuth.error) {
    return json(
      { success: false, error: shopifyAuth.error.message },
      { status: shopifyAuth.error.status },
    );
  }
  const { token, adminUrl } = shopifyAuth;

  const filters = parseProductFilters(request);
  const shopifyQuery = buildShopifyQuery(filters);
  let products = await getAllProductsWithPagination(
    adminUrl,
    token,
    shopifyQuery,
    true,
  );
  products = applyNodeSideFilters(products, filters);

  // Retrieve metaobject definitions to enrich meta fields
  const metaobjectDefinitions = await getMetaobjectDefinitions(adminUrl, token);

  // Dynamic pagination
  const url = new URL(request.url);
  const params = url.searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const pageSize = Math.max(
    1,
    Math.min(250, parseInt(params.get("page_size") || "250", 10)),
  );
  const excludeMetaTaxonomies =
    params.get("exclude_meta_taxonomies") === "true";
  const totalProductsRest = products.length;
  const pageCount = Math.max(1, Math.ceil(totalProductsRest / pageSize));
  const paginatedProducts = products.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  // Transform products to keep only essential fields
  const simplifiedProducts = await Promise.all(
    paginatedProducts.map(async (product: any) => {
      // Extract essential metafields
      const metafields =
        product.metafields?.edges?.map((edge: any) => edge.node) || [];
      const shortDescription = metafields.find(
        (m: any) => m.key === "short_description" && m.namespace === "custom",
      )?.value;
      const technicalSpecs = metafields.find(
        (m: any) => m.key === "technical" && m.namespace === "specs",
      )?.value;

      // Extract variants (SKU, barcode)
      const variants =
        product.variants?.edges?.map((edge: any) => edge.node) || [];
      const firstVariant = variants[0] || {};

      // Extract images
      const images = product.images?.edges?.map((edge: any) => edge.node) || [];

      // Retrieve all resolved meta taxonomies
      const allMetaTaxonomies = await getProductMetaTaxonomies(
        product,
        adminUrl,
        token,
      );

      // Filter only category fields (namespace 'shopify')
      const categoryMetaFields = Object.entries(allMetaTaxonomies)
        .filter(([key, value]: [string, any]) => value.namespace === "shopify")
        .map(([key, value]: [string, any]) => ({
          key: value.key,
          value: value.value,
          type: value.type,
          namespace: value.namespace,
        }));

      // Enrich meta fields with definition information
      const enrichedCategoryMetaFields = enrichMetaFieldsWithDefinitions(
        categoryMetaFields,
        metaobjectDefinitions
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
        images: images.map((img: any) => ({
          id: img.id,
          url: img.url,
        })),
        category: {
          id: product.category?.id,
          name: product.category?.name,
        },
        // Category meta taxonomies (automatic fields) with resolved values and enriched definitions
        category_meta_fields: enrichedCategoryMetaFields,
      };

      // Add complete meta taxonomies if requested
      if (!excludeMetaTaxonomies) {
        simplifiedProduct.meta_taxonomies = allMetaTaxonomies;
      }

      return simplifiedProduct;
    }),
  );

  return json(
    {
      stats: {
        page,
        page_count: pageCount,
        page_size: pageSize,
        total_products: totalProductsRest,
      },
      products: simplifiedProducts,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    },
  );
};
