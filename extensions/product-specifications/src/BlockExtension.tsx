import {
  reactExtension,
  BlockStack,
  Text,
  Divider
} from "@shopify/ui-extensions-react/admin";

export default reactExtension("admin.product-details.block.render", (api: any) => {
  console.log("🔍 API complet:", api);
  
  // Récupérer l'ID du produit
  const productId = api?.data?.[0]?.id;
  console.log("🔍 Product ID:", productId);
  
  // Appeler notre API pour récupérer les spécifications
  if (productId) {
    // Extraire l'ID numérique du GID
    const numericId = productId.split('/').pop();
    console.log("🔍 Numeric ID:", numericId);
    
    // Appeler notre API
    fetch(`/api/specifications/${numericId}`)
      .then(response => response.json())
      .then(data => {
        console.log("🔍 API response:", data);
        
        if (data.success && data.specifications) {
          console.log("✅ Specifications found:", data.specifications);
          
          // Mettre à jour l'affichage
          return (
            <BlockStack>
              <Text fontWeight="bold">Spécifications techniques</Text>
              <Divider />
              {data.specifications.map((spec: any, i: number) => (
                <Text key={i}>
                  {spec.title}: {spec.value}
                </Text>
              ))}
            </BlockStack>
          );
        } else {
          console.log("❌ No specifications found");
        }
      })
      .catch(error => {
        console.error("❌ API error:", error);
      });
  }

  return (
    <BlockStack>
      <Text fontWeight="bold">Spécifications techniques</Text>
      <Divider />
      <Text>
        Aucune spécification technique configurée
      </Text>
    </BlockStack>
  );
});
