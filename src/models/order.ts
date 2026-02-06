export type OrderStatus =
  | "pendiente"
  | "confirmado"
  | "en_preparacion"
  | "listo"
  | "en_camino"
  | "entregado"
  | "cancelado";

export type OrderType = "delivery" | "pickup";

export type PaymentMethod = "efectivo" | "transferencia";

export interface OrderCustomization {
  ingredientId: string;
  ingredientName: string;
  type: "agregar" | "quitar";
  extraPrice: number;
}

export interface OrderExtra {
  extraId: string;
  extraName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  customizations: OrderCustomization[];
  extras?: OrderExtra[];
  itemTotal: number;
  notes?: string;
}

export interface CreateOrderInput {
  tenantId: string;
  customerName: string;
  customerPhone: string;
  whatsappChatId?: string; // ID de chat de WhatsApp para notificaciones
  items: OrderItem[];
  orderType: OrderType;
  deliveryAddress?: string;
  deliveryZoneId?: string;
  deliveryZoneName?: string;
  deliveryNotes?: string; // Referencias para el delivery (ej: "Casa portón negro")
  deliveryId?: string;
  deliveryCost?: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface UpdateOrderInput {
  status?: OrderStatus;
  deliveryId?: string;
  deliveryCost?: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
  deliveryNotes?: string;
}

export interface Order extends CreateOrderInput {
  id: string;
  status: OrderStatus;
  subtotal: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}
