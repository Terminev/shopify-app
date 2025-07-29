import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

// Interface pour les spécifications
interface Specification {
  id: string;
  name: string;
  value: string;
  unit?: string;
  category: string;
}

// GET - Récupérer les spécifications d'un produit
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const productId = params.productId;
  
  if (!productId) {
    return json({ error: "Product ID requis" }, { status: 400 });
  }

  try {
    // TODO: Remplacer par votre vraie API SaaS
    // Pour l'instant, retournons des données de test
    const mockSpecifications: Specification[] = [
      {
        id: "1",
        name: "Matériau",
        value: "Aluminium",
        category: "Matériaux"
      },
      {
        id: "2", 
        name: "Poids",
        value: "2.5",
        unit: "kg",
        category: "Dimensions"
      },
      {
        id: "3",
        name: "Puissance",
        value: "1000",
        unit: "W",
        category: "Performance"
      }
    ];

    return json({ 
      specifications: mockSpecifications,
      productId 
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des spécifications:", error);
    return json({ error: "Erreur serveur" }, { status: 500 });
  }
};

// POST - Sauvegarder une nouvelle spécification
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const productId = params.productId;
  
  if (!productId) {
    return json({ error: "Product ID requis" }, { status: 400 });
  }

  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { name, value, unit, category } = body;

    if (!name || !value || !category) {
      return json({ error: "Nom, valeur et catégorie requis" }, { status: 400 });
    }

    // TODO: Sauvegarder dans votre vraie API SaaS
    const newSpecification: Specification = {
      id: Date.now().toString(),
      name,
      value,
      unit,
      category
    };

    console.log("Nouvelle spécification sauvegardée:", newSpecification);

    return json({ 
      success: true, 
      specification: newSpecification 
    });
  } catch (error) {
    console.error("Erreur lors de la sauvegarde:", error);
    return json({ error: "Erreur serveur" }, { status: 500 });
  }
}; 