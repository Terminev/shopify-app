import React from 'react';
import {
  Button,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
} from '@shopify/polaris';

interface ProductSpecificationsProps {
  target: any;
  data: {
    product: {
      id: string;
      title: string;
      handle: string;
    };
  };
}

export default function ProductSpecifications({ target, data }: ProductSpecificationsProps) {
  const productId = data.product.id;
  const productTitle = data.product.title;

  const handleOpenSpecifications = () => {
    // Ouvrir une nouvelle fenêtre avec la page de spécifications
    const url = `/specifications/${encodeURIComponent(productId)}?title=${encodeURIComponent(productTitle)}`;
    window.open(url, '_blank', 'width=800,height=600');
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h2">
            Spécifications Techniques
          </Text>
          <Badge tone="success">IA Enrichie</Badge>
        </InlineStack>
        
        <Text variant="bodyMd" as="p">
          Gérez les spécifications techniques enrichies par IA pour ce produit.
        </Text>
        
        <Button 
          onClick={handleOpenSpecifications}
          variant="primary"
          fullWidth
        >
          Voir les spécifications
        </Button>
        
        <Text variant="bodySm" tone="subdued" as="p">
          Matériaux, dimensions, performance et plus encore générés par votre IA.
        </Text>
      </BlockStack>
    </Card>
  );
} 