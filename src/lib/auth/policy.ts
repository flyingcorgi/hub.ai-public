export interface Principal {
  userId: string;
  email: string;
  emailVerified: boolean;
  role: "admin" | "user";
  paidThroughAt: number | null;
  revoked: boolean;
}

export function hasWorkflowAccess(user: Principal | null, now = Date.now()): boolean {
  if (!user || !user.emailVerified) return false;
  return user.role === "admin" || (!user.revoked && user.paidThroughAt !== null && user.paidThroughAt > now);
}

export function mayReadWorkflow(user: Principal | null, workflow: { free: boolean; published: boolean }): boolean {
  if (user?.emailVerified && user.role === "admin") return true;
  return workflow.published && (workflow.free || hasWorkflowAccess(user));
}
