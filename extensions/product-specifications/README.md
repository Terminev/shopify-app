# Extension Spécifications Techniques

Cette extension ajoute une section "Spécifications Techniques" dans l'interface d'édition de produit Shopify.

## 🎯 Fonctionnalités

- **Affichage des spécifications** : Affiche les spécifications techniques générées par votre SaaS
- **Ajout manuel** : Permet d'ajouter des spécifications manuellement
- **Organisation par catégories** : Matériaux, Dimensions, Performance, etc.
- **Badge IA** : Indique les spécifications générées par IA

## 🚀 Installation

1. **Développement local** :
```bash
npm run dev
```

2. **Déploiement** :
```bash
npm run deploy
```

## 🔧 Configuration

### API Endpoint

L'extension utilise l'endpoint `/api/specifications/{productId}` pour :
- **GET** : Récupérer les spécifications d'un produit
- **POST** : Ajouter une nouvelle spécification

### Intégration avec votre SaaS

Modifiez `app/routes/api.specifications.$productId.tsx` pour :
1. Récupérer les spécifications depuis votre API SaaS
2. Sauvegarder les nouvelles spécifications dans votre base de données

## 📊 Structure des données

```typescript
interface Specification {
  id: string;
  name: string;        // "Matériau", "Poids", "Puissance"
  value: string;       // "Aluminium", "2.5", "1000"
  unit?: string;       // "kg", "W", "cm"
  category: string;    // "Matériaux", "Dimensions", "Performance"
}
```

## 🎨 Interface

L'extension s'affiche dans un bloc dans la page produit Shopify avec :
- Titre "Spécifications Techniques"
- Bouton "Ajouter" pour créer de nouvelles spécifications
- Organisation par catégories
- Badges "Généré par IA" pour les spécifications automatiques

## 🔗 Prochaines étapes

1. **Connecter à votre SaaS** : Remplacer les données de test par votre vraie API
2. **Synchronisation** : Ajouter la synchronisation avec votre système d'enrichissement
3. **Permissions** : Gérer les permissions d'accès aux spécifications
4. **Export** : Permettre l'export des spécifications vers d'autres systèmes 