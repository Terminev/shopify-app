import {
  reactExtension,
  BlockStack,
  Text,
  Divider
} from "@shopify/ui-extensions-react/admin";

export default reactExtension("admin.product-details.block.render", (extensionApi: any) => {
  // Accéder aux metafields via l'API de l'extension
  const metafields = extensionApi?.data?.metafields || [];
  const technicalSpecs = metafields.find(
    (mf: any) => mf.namespace === "specs" && mf.key === "technical"
  );

  let specsArray: { title: string; value: string }[] = [];
  if (technicalSpecs?.value) {
    try {
      specsArray = JSON.parse(technicalSpecs.value);
    } catch {
      specsArray = [];
    }
  }

  return (
    <BlockStack>
      <Text fontWeight="bold">Spécifications techniques</Text>
      <Divider />
      {specsArray.length > 0 ? (
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
