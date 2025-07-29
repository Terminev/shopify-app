import {
  reactExtension,
  BlockStack,
  Text,
  Divider
} from "@shopify/ui-extensions-react/admin";
import { useState, useEffect } from "react";

export default reactExtension("admin.product-details.block.render", (api: any) => {
  const [specsArray, setSpecsArray] = useState<{ title: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true);
  
  console.log("🔍 API complet:", api);
  
  const productId = api?.data?.selected?.[0]?.id;
  console.log("🔍 Product ID:", productId);
  
  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }

    // Utiliser l'API GraphQL directe avec l'URL spéciale
    const query = `
      query getProductMetafield($id: ID!) {
        product(id: $id) {
          metafield(namespace: "specs", key: "technical") {
            value
          }
        }
      }
    `;

    // Utiliser fetch avec l'URL spéciale shopify:admin/api/graphql.json
    fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      body: JSON.stringify({
        query,
        variables: { id: productId }
      }),
    })
    .then(response => response.json())
    .then(result => {
      console.log("🔍 GraphQL result:", result);
      
      const metafieldValue = result?.data?.product?.metafield?.value;
      console.log("🔍 Metafield value:", metafieldValue);
      
      if (metafieldValue) {
        try {
          const parsedSpecs = JSON.parse(metafieldValue);
          console.log("✅ Parsed specs:", parsedSpecs);
          setSpecsArray(parsedSpecs);
        } catch (error) {
          console.error("❌ Error parsing:", error);
          setSpecsArray([]);
        }
      } else {
        setSpecsArray([]);
      }
      setLoading(false);
    })
    .catch(error => {
      console.error("❌ GraphQL error:", error);
      setSpecsArray([]);
      setLoading(false);
    });
  }, [productId]);

  if (!productId) {
    return (
      <BlockStack>
        <Text fontWeight="bold">Spécifications techniques</Text>
        <Divider />
        <Text>Produit introuvable</Text>
      </BlockStack>
    );
  }

  return (
    <BlockStack>
      <Text fontWeight="bold">Spécifications techniques</Text>
      <Divider />
      {loading ? (
        <Text>Chargement...</Text>
      ) : specsArray.length > 0 ? (
        specsArray.map((spec, i) => (
          <Text key={i}>
            {spec.title}: {spec.value}
          </Text>
        ))
      ) : (
        <Text>
          Aucune spécification technique configurée
        </Text>
      )}
    </BlockStack>
  );
});
