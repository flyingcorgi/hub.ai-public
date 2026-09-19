// IPN (webhook) signature verification — algorithm confirmed against NOWPayments' own official
// Node SDK (github.com/NowPaymentsIO/nowpayments-sdk-nodejs, src/ipn.js): HMAC-SHA512 over
// JSON.stringify() of the payload with every object's keys sorted alphabetically (recursively),
// hex-encoded, compared to the `x-nowpayments-sig` request header. Never skip the recursive sort
// — an unsorted JSON.stringify() produces a different byte string and every signature will fail.
import crypto from "node:crypto";

function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (value && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortObjectDeep((value as Record<string, unknown>)[key]);
        return result;
      }, Object.create(null));
  }
  return value;
}

function getIpnSecret(): string {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) throw new Error("NOWPAYMENTS_IPN_SECRET is not set — add it to .env.local");
  return secret;
}

function computeSignature(payload: unknown): string {
  return crypto.createHmac("sha512", getIpnSecret().trim()).update(JSON.stringify(sortObjectDeep(payload))).digest("hex");
}

// Timing-safe: a plain `===` string comparison would let an attacker recover the correct
// signature one byte at a time by measuring response latency.
export function verifyIpnSignature(payload: unknown, signatureHeader: string | null): boolean {
  if (!signatureHeader || !/^[a-f0-9]{128}$/i.test(signatureHeader.trim())) return false;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(computeSignature(payload), "hex");
    actual = Buffer.from(signatureHeader.trim(), "hex");
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
