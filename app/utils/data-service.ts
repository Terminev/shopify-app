// Types for your app's actual data
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

// Service to manage data (simple version without a database)
export class DataService {
  private static instance: DataService;
  
  private constructor() {}
  
  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  // Retrieve shop connection data
  async getShopConnection(shopId: string): Promise<ShopConnection | null> {
    console.log(`🔍 Retrieving connection data for shop ${shopId}`);
    
    // Simulation - returns mock data
    return {
      shop_id: shopId,
      shop_domain: "example.myshopify.com",
      shop_url: "https://example.myshopify.com",
      access_token: "shpat_...",
      created_at: new Date(),
      last_sync: new Date()
    };
  }

  // Retrieve synchronization logs for a shop
  async getSyncLogs(shopId: string): Promise<SyncLog[]> {
    console.log(`📊 Retrieving sync logs for shop ${shopId}`);
    
    // Simulation - returns mock logs
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

  // Retrieve synchronized product data
  async getProductSyncData(shopId: string): Promise<ProductSyncData[]> {
    console.log(`📦 Retrieving product data for shop ${shopId}`);
    
    // Simulation - returns mock products
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

  // Delete all data for a shop
  async deleteShopData(shopId: string): Promise<boolean> {
    console.log(`🗑️ Deleting data for shop ${shopId}`);
    
    // Simulation - always deletes successfully
    console.log(`✅ Data deleted for shop ${shopId}`);
    return true;
  }

  // Delete data for a specific customer
  async deleteCustomerData(customerId: string, shopId: string): Promise<boolean> {
    console.log(`🗑️ Deleting customer data ${customerId} for shop ${shopId}`);
    
    // Simulation - always deletes successfully
    console.log(`✅ Customer data deleted`);
    return true;
  }

  // Generate a GDPR report for a customer
  async generateGDPRReport(customerId: string, shopId: string): Promise<any> {
    console.log(`📋 Generating GDPR report for customer ${customerId} of shop ${shopId}`);
    
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

  // Utility methods for your app

  // Save a shop connection
  async createShopConnection(shopId: string, shopDomain: string, shopUrl: string, accessToken: string): Promise<void> {
    console.log(`✅ Shop connection saved: ${shopDomain}`);
  }

  // Save a synchronization log
  async createSyncLog(shopId: string, syncType: 'import' | 'export', productsCount: number, status: 'success' | 'error' | 'partial', errorMessage?: string): Promise<void> {
    console.log(`✅ Sync log saved: ${syncType} - ${productsCount} products`);
  }

  // Save a synchronized product
  async createProductSync(shopId: string, shopifyProductId: string, syncDirection: 'shopify_to_saas' | 'saas_to_shopify', saasProductId?: string): Promise<void> {
    console.log(`✅ Synchronized product saved: ${shopifyProductId}`);
  }
} 