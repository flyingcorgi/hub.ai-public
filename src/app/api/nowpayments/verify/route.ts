import { privateJson } from "@/lib/privacy/responses";

// Retired: knowing an email/access code is not account authentication. Never read legacy files.
export async function POST() {
  return privateJson({ error: "Access-code verification is retired. Sign in to your account; legacy payments require operator review." }, 410);
}
