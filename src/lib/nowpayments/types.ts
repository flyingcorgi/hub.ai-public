export interface BillingSummary {
  enrollmentEnabled: boolean;
  plan: { amountUsd: number; currency: string; intervalDays: number };
  subscriptions: Array<{ id: string; status: "creating" | "active" | "needs_reconciliation"; createdAt: string }>;
}
