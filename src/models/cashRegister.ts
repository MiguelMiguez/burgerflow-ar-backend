export interface CashRegisterSummary {
  cashTotal: number;
  transferTotal: number;
  deliveryCostTotal: number;
  subtotal: number;
  grandTotal: number;
  orderCount: number;
  cancelledCount: number;
}

export interface CreateCashRegisterInput {
  tenantId: string;
  date: string; // Formato: YYYY-MM-DD
  summary: CashRegisterSummary;
  closedBy: string;
  notes?: string;
}

export interface CashRegister extends CreateCashRegisterInput {
  id: string;
  closedAt: string;
  createdAt: string;
}

export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface SalesReport {
  period: ReportPeriod;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalOrders: number;
  totalCash: number;
  totalTransfer: number;
  totalDeliveryCost: number;
  averageOrderValue: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
}
