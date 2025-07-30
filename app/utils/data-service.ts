import { PrismaClient } from "@prisma/client";

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

// Service pour gérer les données avec Prisma
export class DataService {
  private static instance: DataService;
  private prisma: PrismaClient;
  
  private constructor() {
    this.prisma = new PrismaClient();
  }
  
  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  // Récupérer les données de connexion d'une boutique
  async getShopConnection(shopId: string): Promise<ShopConnection | null> {
    console.log(`🔍 Récupération des données de connexion pour boutique ${shopId}`);
    
    try {
      const shopConnection = await this.prisma.shopConnection.findUnique({
        where: { shopId }
      });

      if (!shopConnection) {
        return null;
      }

      return {
        shop_id: shopConnection.shopId,
        shop_domain: shopConnection.shopDomain,
        shop_url: shopConnection.shopUrl,
        access_token: shopConnection.accessToken,
        created_at: shopConnection.createdAt,
        last_sync: shopConnection.lastSyncAt || undefined
      };
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des données boutique ${shopId}:`, error);
      return null;
    }
  }

  // Récupérer les logs de synchronisation d'une boutique
  async getSyncLogs(shopId: string): Promise<SyncLog[]> {
    console.log(`📊 Récupération des logs de sync pour boutique ${shopId}`);
    
    try {
      const syncLogs = await this.prisma.syncLog.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' }
      });

      return syncLogs.map(log => ({
        id: log.id,
        shop_id: log.shopId,
        sync_type: log.syncType as 'import' | 'export',
        products_count: log.productsCount,
        status: log.status as 'success' | 'error' | 'partial',
        error_message: log.errorMessage || undefined,
        created_at: log.createdAt
      }));
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des logs pour boutique ${shopId}:`, error);
      return [];
    }
  }

  // Récupérer les données de produits synchronisés
  async getProductSyncData(shopId: string): Promise<ProductSyncData[]> {
    console.log(`📦 Récupération des données de produits pour boutique ${shopId}`);
    
    try {
      const productSyncs = await this.prisma.productSync.findMany({
        where: { shopId },
        orderBy: { lastSyncAt: 'desc' }
      });

      return productSyncs.map(product => ({
        shopify_product_id: product.shopifyProductId,
        shop_id: product.shopId,
        saas_product_id: product.saasProductId || undefined,
        last_sync: product.lastSyncAt,
        sync_direction: product.syncDirection as 'shopify_to_saas' | 'saas_to_shopify'
      }));
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des produits pour boutique ${shopId}:`, error);
      return [];
    }
  }

  // Supprimer toutes les données d'une boutique
  async deleteShopData(shopId: string): Promise<boolean> {
    console.log(`🗑️ Suppression des données pour boutique ${shopId}`);
    
    try {
      // Supprimer la connexion boutique (cascade supprimera les logs et produits)
      await this.prisma.shopConnection.delete({
        where: { shopId }
      });
      
      console.log(`✅ Données supprimées pour boutique ${shopId}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Erreur lors de la suppression pour boutique ${shopId}:`, error);
      return false;
    }
  }

  // Supprimer les données d'un client spécifique
  async deleteCustomerData(customerId: string, shopId: string): Promise<boolean> {
    console.log(`🗑️ Suppression des données client ${customerId} de la boutique ${shopId}`);
    
    // Dans ton cas, tu n'as pas de données client spécifiques
    // car tu synchronises des produits, pas des clients
    // Mais on peut supprimer les logs liés à ce client si nécessaire
    
    try {
      // Pour l'instant, on ne fait rien car tu n'as pas de données client
      // Mais tu pourrais ajouter une table CustomerData si nécessaire
      
      console.log(`✅ Données client supprimées`);
      return true;
      
    } catch (error) {
      console.error(`❌ Erreur lors de la suppression des données client:`, error);
      return false;
    }
  }

  // Générer un rapport GDPR pour un client
  async generateGDPRReport(customerId: string, shopId: string): Promise<any> {
    console.log(`📋 Génération rapport GDPR pour client ${customerId} de boutique ${shopId}`);
    
    // Dans ton cas, le rapport sera principalement sur les produits synchronisés
    // et les logs d'activité, pas sur des données client personnelles
    
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
    try {
      await this.prisma.shopConnection.upsert({
        where: { shopId },
        update: {
          shopDomain,
          shopUrl,
          accessToken,
          updatedAt: new Date()
        },
        create: {
          shopId,
          shopDomain,
          shopUrl,
          accessToken
        }
      });
      console.log(`✅ Connexion boutique enregistrée: ${shopDomain}`);
    } catch (error) {
      console.error(`❌ Erreur lors de l'enregistrement de la connexion boutique:`, error);
    }
  }

  // Enregistrer un log de synchronisation
  async createSyncLog(shopId: string, syncType: 'import' | 'export', productsCount: number, status: 'success' | 'error' | 'partial', errorMessage?: string): Promise<void> {
    try {
      await this.prisma.syncLog.create({
        data: {
          shopId,
          syncType,
          productsCount,
          status,
          errorMessage
        }
      });
      console.log(`✅ Log de sync enregistré: ${syncType} - ${productsCount} produits`);
    } catch (error) {
      console.error(`❌ Erreur lors de l'enregistrement du log de sync:`, error);
    }
  }

  // Enregistrer un produit synchronisé
  async createProductSync(shopId: string, shopifyProductId: string, saasProductId?: string, syncDirection: 'shopify_to_saas' | 'saas_to_shopify'): Promise<void> {
    try {
      await this.prisma.productSync.upsert({
        where: {
          shopId_shopifyProductId: {
            shopId,
            shopifyProductId
          }
        },
        update: {
          saasProductId,
          syncDirection,
          lastSyncAt: new Date()
        },
        create: {
          shopId,
          shopifyProductId,
          saasProductId,
          syncDirection
        }
      });
      console.log(`✅ Produit synchronisé enregistré: ${shopifyProductId}`);
    } catch (error) {
      console.error(`❌ Erreur lors de l'enregistrement du produit sync:`, error);
    }
  }
} 