import { z } from "zod";

// Never round provider identifiers through an unsafe JS integer.
export const providerId = z.union([
  z.string().regex(/^[0-9]{1,40}$/), z.number().int().positive().safe().transform(String),
]);
export const decimal = z.union([z.string().max(80), z.number().finite()]).transform(String)
  .refine((v) => /^\d+(?:\.\d+)?(?:e-\d{1,2})?$/i.test(v), "Invalid decimal")
  .refine((v) => { try { return decimalUnits(v) >= BigInt(0); } catch { return false; } }, "Invalid decimal");

// Fixed-point comparisons, including small crypto quantities represented in exponent notation.
export function decimalUnits(value: string): bigint {
  const [coefficient, exponent = "0"] = value.toLowerCase().split("e-");
  const [whole, fraction = ""] = coefficient.split(".");
  const scale = fraction.length + Number(exponent);
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || scale > 18 || whole.length > 30) throw new Error("Invalid decimal");
  return BigInt(whole + fraction) * (BigInt(10) ** BigInt(18 - scale));
}
export const planSchema = z.object({
  id: providerId, amount: decimal, currency: z.string().transform((v) => v.toLowerCase()),
  interval_day: z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()]).transform(Number),
  ipn_callback_url: z.string().nullable(),
});
export const subscriptionSchema = z.object({
  id: providerId, subscription_plan_id: providerId,
  subscriber: z.object({ email: z.string().email().transform((v) => v.toLowerCase()) }),
  status: z.enum(["WAITING_PAY", "PAID", "PARTIALLY_PAID", "EXPIRED"]),
});
export const paymentStatusSchema = z.object({
  payment_id: providerId,
  payment_status: z.enum(["waiting", "confirming", "confirmed", "sending", "partially_paid", "finished", "failed", "refunded", "expired"]),
});
export const paymentSchema = paymentStatusSchema.extend({
  price_amount: decimal, price_currency: z.string().transform((v) => v.toLowerCase()),
  pay_amount: decimal, actually_paid: decimal,
  pay_currency: z.string().min(1).max(40).regex(/^[a-zA-Z0-9]+$/).transform((v) => v.toLowerCase()),
});
export type ProviderPlan = z.infer<typeof planSchema>;
export type ProviderSubscription = z.infer<typeof subscriptionSchema>;
export type ProviderPayment = z.infer<typeof paymentSchema>;
