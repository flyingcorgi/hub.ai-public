import { getPrincipal } from "@/lib/auth/authorization";
import { hasWorkflowAccess } from "@/lib/auth/policy";
import { accessFailure } from "@/lib/auth/http";
import { privateJson } from "@/lib/privacy/responses";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await getPrincipal(request.headers);
    return privateJson({ user, unlocked: hasWorkflowAccess(user) });
  } catch (error) { return accessFailure(error); }
}
