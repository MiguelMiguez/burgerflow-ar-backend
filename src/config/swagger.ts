const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "BurgerFlow API",
    version: "2.0.0",
    description:
      "API para el sistema de pedidos de hamburguesas por WhatsApp. Permite administrar productos, pedidos, stock de ingredientes, deliverys y cierres de caja.",
    contact: {
      name: "BurgerFlow",
    },
  },
  servers: [
    {
      url: "http://localhost:3000/api",
      description: "Entorno local",
    },
  ],
  tags: [
    { name: "Tenants", description: "Administración de hamburgueserías" },
    { name: "Products", description: "Menú de hamburguesas" },
    { name: "Ingredients", description: "Stock de ingredientes" },
    { name: "Orders", description: "Pedidos de clientes" },
    { name: "Deliveries", description: "Repartidores" },
    { name: "Delivery Zones", description: "Zonas y costos de envío" },
    { name: "Cash Register", description: "Cierres de caja y reportes" },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Clave del API para autenticación (admin o user)",
      },
      TenantId: {
        type: "apiKey",
        in: "header",
        name: "x-tenant-id",
        description: "Identificador de la hamburguesería",
      },
    },
    schemas: {
      Tenant: {
        type: "object",
        properties: {
          id: { type: "string", example: "tenant_123" },
          name: { type: "string", example: "Burger Palace" },
          address: { type: "string", example: "Av. Corrientes 1234" },
          phone: { type: "string", example: "+54 11 5555-5555" },
          logo: { type: "string", example: "https://example.com/logo.png" },
          whatsappNumber: { type: "string", example: "+5491155555555" },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string", example: "prod_123" },
          tenantId: { type: "string", example: "tenant_123" },
          name: { type: "string", example: "Hamburguesa Clásica" },
          description: {
            type: "string",
            example: "Carne, lechuga, tomate, queso",
          },
          price: { type: "number", example: 2500 },
          image: { type: "string", example: "https://example.com/burger.jpg" },
          category: {
            type: "string",
            enum: [
              "simple",
              "doble",
              "triple",
              "especial",
              "vegetariana",
              "combo",
            ],
            example: "simple",
          },
          ingredients: {
            type: "array",
            items: { $ref: "#/components/schemas/ProductIngredient" },
          },
          available: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ProductIngredient: {
        type: "object",
        properties: {
          ingredientId: { type: "string" },
          ingredientName: { type: "string", example: "Queso cheddar" },
          quantity: { type: "number", example: 50 },
          unit: { type: "string", example: "gramos" },
          isRemovable: { type: "boolean", example: true },
          isExtra: { type: "boolean", example: true },
          extraPrice: { type: "number", example: 300 },
        },
      },
      Ingredient: {
        type: "object",
        properties: {
          id: { type: "string", example: "ing_123" },
          tenantId: { type: "string" },
          name: { type: "string", example: "Pan de hamburguesa" },
          unit: {
            type: "string",
            enum: ["gramos", "unidades", "ml", "kg", "litros"],
            example: "unidades",
          },
          stock: { type: "number", example: 100 },
          minStock: { type: "number", example: 20 },
          costPerUnit: { type: "number", example: 50 },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string", example: "order_123" },
          tenantId: { type: "string" },
          customerName: { type: "string", example: "Juan Pérez" },
          customerPhone: { type: "string", example: "+54 11 5555-5555" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderItem" },
          },
          status: {
            type: "string",
            enum: [
              "pendiente",
              "confirmado",
              "en_preparacion",
              "listo",
              "en_camino",
              "entregado",
              "cancelado",
            ],
            example: "pendiente",
          },
          orderType: {
            type: "string",
            enum: ["delivery", "pickup"],
            example: "delivery",
          },
          deliveryAddress: {
            type: "string",
            example: "Av. Corrientes 1234, CABA",
          },
          deliveryId: { type: "string" },
          deliveryCost: { type: "number", example: 500 },
          paymentMethod: {
            type: "string",
            enum: ["efectivo", "transferencia"],
            example: "efectivo",
          },
          subtotal: { type: "number", example: 5000 },
          total: { type: "number", example: 5500 },
          notes: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      OrderItem: {
        type: "object",
        properties: {
          productId: { type: "string" },
          productName: { type: "string", example: "Hamburguesa Clásica" },
          quantity: { type: "number", example: 2 },
          unitPrice: { type: "number", example: 2500 },
          customizations: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderCustomization" },
          },
          itemTotal: { type: "number", example: 5000 },
          notes: { type: "string" },
        },
      },
      OrderCustomization: {
        type: "object",
        properties: {
          ingredientId: { type: "string" },
          ingredientName: { type: "string", example: "Cebolla" },
          type: {
            type: "string",
            enum: ["agregar", "quitar"],
            example: "quitar",
          },
          extraPrice: { type: "number", example: 0 },
        },
      },
      Delivery: {
        type: "object",
        properties: {
          id: { type: "string", example: "del_123" },
          tenantId: { type: "string" },
          name: { type: "string", example: "Carlos García" },
          phone: { type: "string", example: "+54 11 5555-5555" },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      DeliveryZone: {
        type: "object",
        properties: {
          id: { type: "string", example: "zone_123" },
          tenantId: { type: "string" },
          name: { type: "string", example: "Zona Centro" },
          minDistance: { type: "number", example: 0 },
          maxDistance: { type: "number", example: 3 },
          cost: { type: "number", example: 300 },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CashRegister: {
        type: "object",
        properties: {
          id: { type: "string", example: "cash_123" },
          tenantId: { type: "string" },
          date: { type: "string", format: "date", example: "2026-02-03" },
          summary: { $ref: "#/components/schemas/CashRegisterSummary" },
          closedBy: { type: "string", example: "admin" },
          notes: { type: "string" },
          closedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CashRegisterSummary: {
        type: "object",
        properties: {
          cashTotal: { type: "number", example: 15000 },
          transferTotal: { type: "number", example: 25000 },
          deliveryCostTotal: { type: "number", example: 3000 },
          subtotal: { type: "number", example: 37000 },
          grandTotal: { type: "number", example: 40000 },
          orderCount: { type: "number", example: 15 },
          cancelledCount: { type: "number", example: 2 },
        },
      },
      SalesReport: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["daily", "weekly", "monthly"] },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          totalSales: { type: "number" },
          totalOrders: { type: "number" },
          totalCash: { type: "number" },
          totalTransfer: { type: "number" },
          totalDeliveryCost: { type: "number" },
          averageOrderValue: { type: "number" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }, { TenantId: [] }],
  paths: {
    "/tenants": {
      get: {
        tags: ["Tenants"],
        summary: "Listar hamburgueserías",
        responses: {
          200: {
            description: "Lista de tenants",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Tenant" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Tenants"],
        summary: "Crear hamburguesería",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  address: { type: "string" },
                  phone: { type: "string" },
                  logo: { type: "string" },
                  whatsappNumber: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Tenant creado" } },
      },
    },
    "/products": {
      get: {
        tags: ["Products"],
        summary: "Listar productos del menú",
        parameters: [
          { name: "available", in: "query", schema: { type: "boolean" } },
          { name: "category", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Lista de productos",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Product" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Products"],
        summary: "Crear producto",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "price", "category"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  price: { type: "number" },
                  image: { type: "string" },
                  category: { type: "string" },
                  ingredients: { type: "array" },
                  available: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Producto creado" } },
      },
    },
    "/ingredients": {
      get: {
        tags: ["Ingredients"],
        summary: "Listar ingredientes",
        responses: {
          200: {
            description: "Lista de ingredientes",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Ingredient" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Ingredients"],
        summary: "Crear ingrediente",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "unit", "stock", "minStock", "costPerUnit"],
                properties: {
                  name: { type: "string" },
                  unit: { type: "string" },
                  stock: { type: "number" },
                  minStock: { type: "number" },
                  costPerUnit: { type: "number" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Ingrediente creado" } },
      },
    },
    "/ingredients/low-stock": {
      get: {
        tags: ["Ingredients"],
        summary: "Obtener ingredientes con stock bajo",
        responses: {
          200: { description: "Lista de ingredientes con stock bajo" },
        },
      },
    },
    "/ingredients/{id}/stock": {
      patch: {
        tags: ["Ingredients"],
        summary: "Actualizar stock",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["quantity", "type", "reason"],
                properties: {
                  quantity: { type: "number" },
                  type: {
                    type: "string",
                    enum: ["entrada", "salida", "ajuste"],
                  },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Stock actualizado" } },
      },
    },
    "/orders": {
      get: {
        tags: ["Orders"],
        summary: "Listar pedidos",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          {
            name: "date",
            in: "query",
            schema: { type: "string", format: "date" },
          },
          { name: "pending", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: {
            description: "Lista de pedidos",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Order" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Orders"],
        summary: "Crear pedido",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "customerName",
                  "customerPhone",
                  "items",
                  "orderType",
                  "paymentMethod",
                ],
                properties: {
                  customerName: { type: "string" },
                  customerPhone: { type: "string" },
                  items: { type: "array" },
                  orderType: { type: "string", enum: ["delivery", "pickup"] },
                  deliveryAddress: { type: "string" },
                  paymentMethod: {
                    type: "string",
                    enum: ["efectivo", "transferencia"],
                  },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Pedido creado" } },
      },
    },
    "/orders/{id}/confirm": {
      post: {
        tags: ["Orders"],
        summary: "Confirmar pedido (descuenta stock)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 200: { description: "Pedido confirmado" } },
      },
    },
    "/orders/{id}/cancel": {
      post: {
        tags: ["Orders"],
        summary: "Cancelar pedido",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 200: { description: "Pedido cancelado" } },
      },
    },
    "/orders/{id}/status": {
      patch: {
        tags: ["Orders"],
        summary: "Actualizar estado del pedido",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: {
                    type: "string",
                    enum: [
                      "pendiente",
                      "confirmado",
                      "en_preparacion",
                      "listo",
                      "en_camino",
                      "entregado",
                      "cancelado",
                    ],
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Estado actualizado" } },
      },
    },
    "/deliveries": {
      get: {
        tags: ["Deliveries"],
        summary: "Listar repartidores",
        parameters: [
          { name: "active", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: {
            description: "Lista de repartidores",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Delivery" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Deliveries"],
        summary: "Crear repartidor",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "phone"],
                properties: {
                  name: { type: "string" },
                  phone: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Repartidor creado" } },
      },
    },
    "/delivery-zones": {
      get: {
        tags: ["Delivery Zones"],
        summary: "Listar zonas de envío",
        responses: {
          200: {
            description: "Lista de zonas",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DeliveryZone" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Delivery Zones"],
        summary: "Crear zona de envío",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "minDistance", "maxDistance", "cost"],
                properties: {
                  name: { type: "string" },
                  minDistance: { type: "number" },
                  maxDistance: { type: "number" },
                  cost: { type: "number" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Zona creada" } },
      },
    },
    "/delivery-zones/calculate": {
      get: {
        tags: ["Delivery Zones"],
        summary: "Calcular costo de envío",
        parameters: [
          {
            name: "distance",
            in: "query",
            required: true,
            schema: { type: "number" },
          },
        ],
        responses: { 200: { description: "Costo calculado" } },
      },
    },
    "/cash-register": {
      get: {
        tags: ["Cash Register"],
        summary: "Listar cierres de caja",
        responses: {
          200: {
            description: "Lista de cierres",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CashRegister" },
                },
              },
            },
          },
        },
      },
    },
    "/cash-register/summary": {
      get: {
        tags: ["Cash Register"],
        summary: "Obtener resumen del día (sin cerrar)",
        parameters: [
          {
            name: "date",
            in: "query",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: { 200: { description: "Resumen del día" } },
      },
    },
    "/cash-register/close": {
      post: {
        tags: ["Cash Register"],
        summary: "Realizar cierre de caja",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["date", "closedBy"],
                properties: {
                  date: { type: "string", format: "date" },
                  closedBy: { type: "string" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Cierre realizado" } },
      },
    },
    "/cash-register/report": {
      get: {
        tags: ["Cash Register"],
        summary: "Generar reporte de ventas",
        parameters: [
          {
            name: "period",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["daily", "weekly", "monthly"] },
          },
          {
            name: "date",
            in: "query",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: { 200: { description: "Reporte generado" } },
      },
    },
  },
};

export default swaggerDocument;
