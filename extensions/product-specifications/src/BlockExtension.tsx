import {
  reactExtension,
  BlockStack,
  Text,
  Divider,
  useApi,
  InlineStack,
  Box,
  TextField,
  Button,
  Form
} from "@shopify/ui-extensions-react/admin";
import { useState, useEffect, useCallback } from "react";

async function getProductSpecs(id: string) {
  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({
      query: `
        query GetProductMetafield($id: ID!) {
          product(id: $id) {
            metafield(namespace: "specs", key: "technical") {
              value
            }
          }
        }
      `,
      variables: { id },
    }),
  });
  return res.json();
}

async function saveProductSpecs(id: string, specs: { title: string; value: string }[]) {
  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({
      query: `
        mutation UpdateProductMetafield($input: MetafieldsSetInput!) {
          metafieldsSet(metafields: [$input]) {
            metafields {
              id
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        input: {
          ownerId: id,
          namespace: "specs",
          key: "technical",
          type: "json",
          value: JSON.stringify(specs)
        }
      },
    }),
  });
  return res.json();
}

const TARGET = 'admin.product-details.block.render';
const SPECS_PER_PAGE = 6;

export default reactExtension(TARGET, () => <App />);

function App() {
  const { i18n } = useApi();
  const { data } = useApi(TARGET);
  
  const [specsArray, setSpecsArray] = useState<{ title: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const productId = data?.selected?.[0]?.id;
    console.log("🔍 Product ID:", productId);
    
    if (!productId) {
      setLoading(false);
      return;
    }

    getProductSpecs(productId).then((result) => {
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
    }).catch(error => {
      console.error("❌ GraphQL error:", error);
      setSpecsArray([]);
      setLoading(false);
    });
  }, [data]);

  const handleSpecChange = (index: number, field: 'title' | 'value', newValue: string) => {
    const updatedSpecs = [...specsArray];
    updatedSpecs[index] = { ...updatedSpecs[index], [field]: newValue };
    setSpecsArray(updatedSpecs);
  };

  const addNewSpec = () => {
    setSpecsArray([...specsArray, { title: '', value: '' }]);
    const totalPages = Math.ceil((specsArray.length + 1) / SPECS_PER_PAGE);
    setCurrentPage(totalPages);
  };

  const removeSpec = (index: number) => {
    const updatedSpecs = specsArray.filter((_, i) => i !== index);
    setSpecsArray(updatedSpecs);
    
    const totalPages = Math.ceil(updatedSpecs.length / SPECS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  };

  const onSubmit = useCallback(async () => {
    const productId = data?.selected?.[0]?.id;
    if (!productId) return;

    setError('');
    try {
      const result = await saveProductSpecs(productId, specsArray);
      console.log("💾 Save result:", result);
      
      if (result?.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error("❌ Save errors:", result.data.metafieldsSet.userErrors);
        setError(result.data.metafieldsSet.userErrors.map(e => e.message).join(', '));
      } else {
        console.log("✅ Specs saved successfully");
      }
    } catch (error) {
      console.error("❌ Save error:", error);
      setError('Erreur lors de la sauvegarde');
    }
  }, [specsArray, data]);

  const onReset = useCallback(async () => {
    const productId = data?.selected?.[0]?.id;
    if (!productId) return;

    setLoading(true);
    try {
      const result = await getProductSpecs(productId);
      const metafieldValue = result?.data?.product?.metafield?.value;
      
      if (metafieldValue) {
        const parsedSpecs = JSON.parse(metafieldValue);
        setSpecsArray(parsedSpecs);
      } else {
        setSpecsArray([]);
      }
      setError('');
      setCurrentPage(1);
    } catch (error) {
      console.error("❌ Reset error:", error);
      setError('Erreur lors du reset');
    } finally {
      setLoading(false);
    }
  }, [data]);

  const totalPages = Math.ceil(specsArray.length / SPECS_PER_PAGE);
  const startIndex = (currentPage - 1) * SPECS_PER_PAGE;
  const endIndex = startIndex + SPECS_PER_PAGE;
  const currentSpecs = specsArray.slice(startIndex, endIndex);

  if (loading) {
    return (
      <BlockStack>
        <Text>{i18n.translate('loading')}</Text>
      </BlockStack>
    );
  }

  return (
    <Form onSubmit={onSubmit} onReset={onReset}>
      <BlockStack>
        <InlineStack inlineAlignment="space-between" blockAlignment="center" gap="base">
          <Text fontWeight="bold">{i18n.translate('title')}</Text>
          <Button onPress={addNewSpec}>
            {i18n.translate('add')}
          </Button>
        </InlineStack>
        <Divider />
        {specsArray.length > 0 ? (
          <BlockStack>
            {currentSpecs.map((spec, i) => {
              const globalIndex = startIndex + i;
              return (
                <Box key={globalIndex}>
                  <InlineStack blockAlignment="center" inlineAlignment="space-between" gap="base">
                    <TextField
                      label=""
                      value={spec.title}
                      onChange={(value) => handleSpecChange(globalIndex, 'title', value)}
                    />
                    <TextField
                      label=""
                      value={spec.value}
                      onChange={(value) => handleSpecChange(globalIndex, 'value', value)}
                    />
                    <Button onPress={() => removeSpec(globalIndex)} tone="critical">
                      ×
                    </Button>
                  </InlineStack>
                </Box>
              );
            })}

            {totalPages > 1 && (
              <Box paddingBlock={true}>
                <InlineStack inlineAlignment="center" gap="base" blockAlignment="center">
                <Button 
                  onPress={() => setCurrentPage(currentPage - 1)} 
                  disabled={currentPage === 1}
                >
                  {i18n.translate('previous')}
                </Button>
                <Text>
                  {i18n.translate('page', { current: currentPage, total: totalPages })}
                </Text>
                <Button 
                  onPress={() => setCurrentPage(currentPage + 1)} 
                  disabled={currentPage === totalPages}
                >
                    {i18n.translate('next')}
                  </Button>
                </InlineStack>
              </Box>
            )}
          </BlockStack>
        ) : (
          <Text>
            {i18n.translate('no_specs')}
          </Text>
        )}
        {error && (
          <Text>
            {error}
          </Text>
        )}
      </BlockStack>
    </Form>
  );
}
