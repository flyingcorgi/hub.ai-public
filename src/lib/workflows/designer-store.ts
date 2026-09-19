import type { WorkflowDefinition, WorkflowRecord, WorkflowSummary } from "./designer-types";

export const WORKFLOWS_CHANGED_EVENT = "hub-workflows-changed";

export class WorkflowRequestError extends Error {
  constructor(public readonly status: number) {
    super(status === 409 ? "Workflow changed elsewhere. Copy your unsaved edits before reloading."
      : status === 401 ? "Sign in to access this workflow."
      : status === 403 ? "You do not currently have access to this workflow."
      : status === 400 ? "Invalid workflow. Check its structure, models and template tokens."
      : status === 413 ? "Workflow is too large (maximum 16 MiB)."
      : status === 404 ? "This workflow is not available."
      : "Could not load or save workflows. Please try again later.");
  }
}
async function result<T>(response: Response): Promise<T> {
  if (!response.ok) throw new WorkflowRequestError(response.status);
  return response.json();
}
export async function loadWorkflowSummaries(admin = false, signal?: AbortSignal): Promise<WorkflowSummary[]> {
  return result(await fetch(`/api/workflows${admin ? "?scope=admin" : ""}`, { cache: "no-store", signal }));
}
export async function loadWorkflowDefinition(id: string, signal?: AbortSignal): Promise<WorkflowRecord> {
  return result(await fetch(`/api/workflows/${encodeURIComponent(id)}`, { cache: "no-store", signal }));
}
export async function loadAdminWorkflows(): Promise<WorkflowRecord[]> {
  const summaries = await loadWorkflowSummaries(true);
  // Bounded sequential fetches, not a fan-out of potentially large reference-bearing responses.
  const records: WorkflowRecord[] = [];
  for (const summary of summaries) records.push(await loadWorkflowDefinition(summary.id));
  return records;
}
export async function saveWorkflowDefinition(definition: WorkflowDefinition, revision: string | null): Promise<WorkflowRecord> {
  const record = await result<WorkflowRecord>(await fetch(`/api/workflows/${encodeURIComponent(definition.id)}`, {
    method: "PUT", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ definition, revision }),
  }));
  window.dispatchEvent(new Event(WORKFLOWS_CHANGED_EVENT));
  return record;
}
export async function deleteWorkflowDefinition(id: string, revision: string): Promise<void> {
  await result(await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: "DELETE", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision }),
  }));
  window.dispatchEvent(new Event(WORKFLOWS_CHANGED_EVENT));
}
