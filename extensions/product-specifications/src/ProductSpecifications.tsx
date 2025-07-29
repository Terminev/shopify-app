import React, { useEffect, useState } from 'react';
import {
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  SkeletonBodyText,
  Button,
  Modal,
  TextField,
  Select,
  Divider,
  Banner,
} from '@shopify/polaris';

interface Specification {
  id: string;
  name: string;
  value: string;
  unit?: string;
  category: string;
}

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
  const [specifications, setSpecifications] = useState<Specification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newSpec, setNewSpec] = useState<Partial<Specification>>({});

  const productId = data.product.id;

  // Récupérer les spécifications depuis votre API
  useEffect(() => {
    fetchSpecifications();
  }, [productId]);

  const fetchSpecifications = async () => {
    try {
      setLoading(true);
      // Appel vers votre API
      const response = await fetch(`/api/specifications/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setSpecifications(data.specifications || []);
      } else {
        setError('Impossible de charger les spécifications');
      }
    } catch (err) {
      setError('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSpecification = async () => {
    try {
      const response = await fetch(`/api/specifications/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSpec),
      });
      
      if (response.ok) {
        await fetchSpecifications();
        setShowModal(false);
        setNewSpec({});
      }
    } catch (err) {
      setError('Erreur lors de la sauvegarde');
    }
  };

  const groupedSpecs = specifications.reduce((acc, spec) => {
    if (!acc[spec.category]) {
      acc[spec.category] = [];
    }
    acc[spec.category].push(spec);
    return acc;
  }, {} as Record<string, Specification[]>);

  if (loading) {
    return (
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            Spécifications Techniques
          </Text>
          <SkeletonBodyText lines={3} />
        </BlockStack>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            Spécifications Techniques
          </Text>
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
          <Button onClick={fetchSpecifications}>Réessayer</Button>
        </BlockStack>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between">
            <Text variant="headingMd" as="h2">
              Spécifications Techniques
            </Text>
            <Button 
              onClick={() => setShowModal(true)}
              variant="primary"
            >
              Ajouter
            </Button>
          </InlineStack>

          {specifications.length === 0 ? (
            <BlockStack gap="300">
              <Text tone="subdued" as="p">
                Aucune spécification technique disponible
              </Text>
              <Text tone="subdued" variant="bodySm" as="p">
                Utilisez votre SaaS pour générer des spécifications techniques enrichies
              </Text>
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              {Object.entries(groupedSpecs).map(([category, specs]) => (
                <BlockStack key={category} gap="300">
                  <Text variant="headingSm" as="h3">
                    {category}
                  </Text>
                  <BlockStack gap="200">
                    {specs.map((spec) => (
                      <InlineStack key={spec.id} align="space-between">
                        <Text variant="bodyMd" as="p">{spec.name}</Text>
                        <InlineStack gap="200" align="center">
                          <Text variant="bodyMd" fontWeight="semibold" as="p">
                            {spec.value}
                            {spec.unit && <Text variant="bodySm" tone="subdued" as="span"> {spec.unit}</Text>}
                          </Text>
                          <Badge tone="success">Généré par IA</Badge>
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                  <Divider />
                </BlockStack>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Ajouter une spécification"
        primaryAction={{
          content: 'Sauvegarder',
          onAction: handleSaveSpecification,
        }}
        secondaryActions={[
          {
            content: 'Annuler',
            onAction: () => setShowModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Nom de la spécification"
              value={newSpec.name || ''}
              onChange={(value) => setNewSpec({ ...newSpec, name: value })}
              autoComplete="off"
            />
            <TextField
              label="Valeur"
              value={newSpec.value || ''}
              onChange={(value) => setNewSpec({ ...newSpec, value })}
              autoComplete="off"
            />
            <TextField
              label="Unité (optionnel)"
              value={newSpec.unit || ''}
              onChange={(value) => setNewSpec({ ...newSpec, unit: value })}
              autoComplete="off"
            />
            <Select
              label="Catégorie"
              options={[
                { label: 'Matériaux', value: 'Matériaux' },
                { label: 'Dimensions', value: 'Dimensions' },
                { label: 'Performance', value: 'Performance' },
                { label: 'Caractéristiques', value: 'Caractéristiques' },
                { label: 'Autre', value: 'Autre' },
              ]}
              value={newSpec.category || ''}
              onChange={(value) => setNewSpec({ ...newSpec, category: value })}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
} 