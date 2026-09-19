import { privateJson } from "@/lib/privacy/responses";

// No public endpoint may create or mutate a merchant billing plan. Configure and verify the
// plan in the operator-owned provider dashboard; this deployment only enrolls into that plan.
export async function POST() {
  return privateJson({ error: "Plan creation through this endpoint is retired. Use operator-managed provider setup." }, 410);
}
