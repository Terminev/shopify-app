# API Meta Taxonomies - Documentation

Cette API permet de récupérer les meta taxonomies attribuées automatiquement selon la catégorie des produits.

## Endpoints disponibles

### 1. Récupérer les meta taxonomies par catégorie

**URL:** `/upsellr/category-meta-taxonomies`

**Paramètres:**
- `category` (optionnel): Nom de la catégorie spécifique
- `product_id` (optionnel): ID du produit spécifique
- `include_suggestions` (optionnel): `true` pour inclure les suggestions (défaut: `false`)
- Tous les paramètres de filtrage des produits (voir `upsellr.products-export`)

**Exemples d'utilisation:**

```bash
# Récupérer toutes les meta taxonomies par catégorie
GET /upsellr/category-meta-taxonomies

# Récupérer les meta taxonomies pour une catégorie spécifique
GET /upsellr/category-meta-taxonomies?category=Consoles%20de%20jeu%20vidéo

# Récupérer les meta taxonomies d'un produit spécifique
GET /upsellr/category-meta-taxonomies?product_id=gid://shopify/Product/123456789

# Inclure les suggestions
GET /upsellr/category-meta-taxonomies?category=Consoles%20de%20jeu%20vidéo&include_suggestions=true
```

**Réponse pour une catégorie spécifique:**
```json
{
  "success": true,
  "category": "Consoles de jeu vidéo",
  "products_count": 15,
  "meta_taxonomies": [
    {
      "namespace": "specs",
      "key": "technical",
      "value": "[{\"title\":\"Couleur\",\"value\":\"Noir\"}]",
      "type": "json"
    },
    {
      "namespace": "custom",
      "key": "color",
      "value": "Noir",
      "type": "single_line_text_field"
    }
  ],
  "suggestions": [
    {
      "namespace": "specs",
      "key": "technical",
      "type": "json",
      "frequency": 0.8,
      "values": ["Noir", "Blanc", "Rouge"],
      "values_count": 3
    }
  ]
}
```

### 2. Récupérer les suggestions de meta taxonomies

**URL:** `/upsellr/category-meta-suggestions`

**Paramètres:**
- `category` (requis): Nom de la catégorie
- `min_frequency` (optionnel): Fréquence minimale pour inclure une suggestion (défaut: 0.1)
- Tous les paramètres de filtrage des produits

**Exemple d'utilisation:**

```bash
# Récupérer les suggestions pour une catégorie
GET /upsellr/category-meta-suggestions?category=Consoles%20de%20jeu%20vidéo

# Avec une fréquence minimale de 50%
GET /upsellr/category-meta-suggestions?category=Consoles%20de%20jeu%20vidéo&min_frequency=0.5
```

**Réponse:**
```json
{
  "success": true,
  "category": "Consoles de jeu vidéo",
  "products_count": 15,
  "suggestions_count": 5,
  "min_frequency": 0.1,
  "suggestions": [
    {
      "namespace": "specs",
      "key": "technical",
      "type": "json",
      "frequency": 0.8,
      "frequency_percentage": 80,
      "values": ["Noir", "Blanc", "Rouge"],
      "values_count": 3
    },
    {
      "namespace": "custom",
      "key": "color",
      "type": "single_line_text_field",
      "frequency": 0.6,
      "frequency_percentage": 60,
      "values": ["Noir", "Blanc"],
      "values_count": 2
    }
  ]
}
```

### 3. Export des produits avec meta taxonomies

**URL:** `/upsellr/products-export`

**Paramètres:**
- `include_meta_taxonomies` (optionnel): `true` pour inclure les meta taxonomies (défaut: `false`)
- Tous les paramètres de filtrage et pagination existants

**Exemple d'utilisation:**

```bash
# Exporter les produits avec leurs meta taxonomies
GET /upsellr/products-export?include_meta_taxonomies=true&page=1&page_size=50
```

**Réponse avec meta taxonomies:**
```json
{
  "stats": {
    "page": 1,
    "page_count": 5,
    "page_size": 50,
    "total_products": 250
  },
  "products": [
    {
      "id": "gid://shopify/Product/123456789",
      "title": "Nintendo Switch",
      "category": {
        "id": "gid://shopify/ProductCategory/123",
        "name": "Consoles de jeu vidéo"
      },
      "meta_taxonomies": {
        "specs.technical": {
          "namespace": "specs",
          "key": "technical",
          "value": "[{\"title\":\"Couleur\",\"value\":\"Noir\"}]",
          "type": "json"
        },
        "custom.color": {
          "namespace": "custom",
          "key": "color",
          "value": "Noir",
          "type": "single_line_text_field"
        }
      }
    }
  ]
}
```

## Fonctionnalités

### Détection automatique des meta taxonomies

Le système détecte automatiquement les métadonnées qui semblent être des taxonomies automatiques en se basant sur:

1. **Namespace spécifiques:** `specs`, `taxonomy`, `category_meta`, etc.
2. **Clés particulières:** contenant `taxonomy`, `auto_meta`, `suggested`, `recommended`, `attributes`, `specifications`
3. **Types de données:** JSON, listes, champs de texte structurés

### Suggestions intelligentes

Les suggestions sont générées en analysant:
- La fréquence d'utilisation des métadonnées dans une catégorie
- Les valeurs communes pour chaque métadonnée
- La cohérence des types de données

### Filtrage par fréquence

Vous pouvez filtrer les suggestions par fréquence minimale pour ne récupérer que les métadonnées les plus pertinentes.

## Cas d'usage

1. **Interface utilisateur:** Afficher les champs suggérés lors de la création/édition d'un produit
2. **Import automatique:** Pré-remplir les métadonnées lors de l'import de produits
3. **Analyse:** Comprendre quelles métadonnées sont les plus utilisées par catégorie
4. **Validation:** Vérifier la cohérence des métadonnées entre produits d'une même catégorie

## Authentification

Toutes les routes nécessitent une authentification Shopify valide via le header `X-Shopify-Access-Token` ou le paramètre `token`. 