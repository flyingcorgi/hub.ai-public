import { closeDb, getDb } from "../src/lib/db";
import { reconcilePayment, reconcileSubscription } from "../src/lib/nowpayments/billing";

(async () => {
  try {
    const [action, localId, providerId, confirmation, ...extra] = process.argv.slice(2);
    if (!localId || !providerId || extra.length || confirmation !== "--confirm-provider-link" || !["subscription", "payment"].includes(action)) {
      console.error("Usage: npm run billing:reconcile -- <subscription|payment> <local-subscription-id> <provider-id> --confirm-provider-link");
      process.exitCode = 1;
      return;
    }
    // Explicit confirmation means the operator verified this exact provider relationship in
    // provider-owned records/support, NOT by matching an email, amount, plan or browser hint.
    if (action === "subscription") await reconcileSubscription(getDb(), localId, providerId);
    else await reconcilePayment(getDb(), localId, providerId);
    console.log("Billing reconciliation committed. Duplicate payment processing never extends access twice.");
  } catch {
    console.error("Reconciliation failed. Check provider association, configuration and stored billing facts. No provider payloads or credentials are logged.");
    process.exitCode = 1;
  } finally { await closeDb(); }
})();
