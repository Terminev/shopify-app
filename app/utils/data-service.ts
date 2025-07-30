// Types pour les données réelles de ton app
export interface ShopConnection {
  shop_id: string;
  shop_domain: string;
  shop_url: string;
  access_token: string;
  created_at: Date;
  last_sync?: Date;
}

export interface SyncLog {
  id: string;
  shop_id: string;
  sync_type: 'import' | 'export';
  products_count: number;
  status: 'success' | 'error' | 'partial';
  error_message?: string;
  created_at: Date;
}

export interface ProductSyncData {
  shopify_product_id: string;
  shop_id: string;
  saas_product_id?: string;
  last_sync: Date;
  sync_direction: 'shopify_to_saas' | 'saas_to_shopify';
}

// Service pour gérer les données (version simple sans base de données)
export class DataService {
  private static instance: DataService;
  
  private constructor() {}
  
  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  // Récupérer les données de connexion d'une boutique
  async getShopConnection(shopId: string): Promise<ShopConnection | null> {
    console.log(`🔍 Récupération des données de connexion pour boutique ${shopId}`);
    
    // Simulation - retourne des données factices
    return {
      shop_id: shopId,
      shop_domain: "example.myshopify.com",
      shop_url: "https://example.myshopify.com",
      access_token: "shpat_...",
      created_at: new Date(),
      last_sync: new Date()
    };
  }

  // Récupérer les logs de synchronisation d'une boutique
  async getSyncLogs(shopId: string): Promise<SyncLog[]> {
    console.log(`📊 Récupération des logs de sync pour boutique ${shopId}`);
    
    // Simulation - retourne des logs factices
    return [
      {
        id: "1",
        shop_id: shopId,
        sync_type: "import",
        products_count: 150,
        status: "success",
        created_at: new Date()
      },
      {
        id: "2", 
        shop_id: shopId,
        sync_type: "export",
        products_count: 75,
        status: "success",
        created_at: new Date()
      }
    ];
  }

  // Récupérer les données de produits synchronisés
  async getProductSyncData(shopId: string): Promise<ProductSyncData[]> {
    console.log(`📦 Récupération des données de produits pour boutique ${shopId}`);
    
    // Simulation - retourne des produits factices
    return [
      {
        shopify_product_id: "gid://shopify/Product/123",
        shop_id: shopId,
        saas_product_id: "saas_prod_456",
        last_sync: new Date(),
        sync_direction: "shopify_to_saas"
      }
    ];
  }

  // Supprimer toutes les données d'une boutique
  async deleteShopData(shopId: string): Promise<boolean> {
    console.log(`🗑️ Suppression des données pour boutique ${shopId}`);
    
    // Simulation - supprime toujours avec succès
    console.log(`✅ Données supprimées pour boutique ${shopId}`);
    return true;
  }

  // Supprimer les données d'un client spécifique
  async deleteCustomerData(customerId: string, shopId: string): Promise<boolean> {
    console.log(`🗑️ Suppression des données client ${customerId} de la boutique ${shopId}`);
    
    // Simulation - supprime toujours avec succès
    console.log(`✅ Données client supprimées`);
    return true;
  }

  // Générer un rapport GDPR pour un client
  async generateGDPRReport(customerId: string, shopId: string): Promise<any> {
    console.log(`📋 Génération rapport GDPR pour client ${customerId} de boutique ${shopId}`);
    
    const shopConnection = await this.getShopConnection(shopId);
    const syncLogs = await this.getSyncLogs(shopId);
    const productData = await this.getProductSyncData(shopId);
    
    return {
      customer_id: customerId,
      shop_id: shopId,
      data_types: [
        "shop_connection_data",
        "product_sync_data", 
        "sync_activity_logs"
      ],
      data_summary: {
        shop_connected: !!shopConnection,
        total_sync_operations: syncLogs.length,
        total_products_synced: productData.length,
        last_sync: shopConnection?.last_sync
      },
      data_export: {
        shop_connection: shopConnection ? {
          shop_domain: shopConnection.shop_domain,
          created_at: shopConnection.created_at,
          last_sync: shopConnection.last_sync
        } : null,
        sync_logs: syncLogs.map(log => ({
          sync_type: log.sync_type,
          products_count: log.products_count,
          status: log.status,
          created_at: log.created_at
        })),
        synced_products: productData.map(product => ({
          shopify_product_id: product.shopify_product_id,
          sync_direction: product.sync_direction,
          last_sync: product.last_sync
        }))
      }
    };
  }

  // Méthodes utilitaires pour ton app

  // Enregistrer une connexion boutique
  async createShopConnection(shopId: string, shopDomain: string, shopUrl: string, accessToken: string): Promise<void> {
    console.log(`✅ Connexion boutique enregistrée: ${shopDomain}`);
    // Simulation - ne fait rien en réalité
  }

  // Enregistrer un log de synchronisation
  async createSyncLog(shopId: string, syncType: 'import' | 'export', productsCount: number, status: 'success' | 'error' | 'partial', errorMessage?: string): Promise<void> {
    console.log(`✅ Log de sync enregistré: ${syncType} - ${productsCount} produits`);
    // Simulation - ne fait rien en réalité
  }

  // Enregistrer un produit synchronisé
  async createProductSync(shopId: string, shopifyProductId: string, syncDirection: 'shopify_to_saas' | 'saas_to_shopify', saasProductId?: string): Promise<void> {
    console.log(`✅ Produit synchronisé enregistré: ${shopifyProductId}`);
    // Simulation - ne fait rien en réalité
  }
} 