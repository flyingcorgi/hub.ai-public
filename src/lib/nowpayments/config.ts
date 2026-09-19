// Immutable application terms for this product. Provider plans are mutable: validate them
// before enrollment and never silently change existing subscription snapshots.
export const PLAN_INTERVAL_DAYS = 90;
export const PLAN_AMOUNT_USD = 45;
export const PLAN_CURRENCY = "usd";

export function enrollmentEnabled(): boolean {
  return process.env.NOWPAYMENTS_ENROLLMENT_ENABLED === "true" &&
    Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_ACCOUNT_EMAIL &&
      process.env.NOWPAYMENTS_ACCOUNT_PASSWORD && process.env.NOWPAYMENTS_PLAN_ID &&
      process.env.NOWPAYMENTS_IPN_SECRET && process.env.NOWPAYMENTS_IPN_CALLBACK_URL);
}
