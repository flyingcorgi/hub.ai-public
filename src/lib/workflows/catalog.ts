import type { Pool } from "pg";
import { AccessError } from "@/lib/auth/authorization";
import { hasWorkflowAccess, mayReadWorkflow, type Principal } from "@/lib/auth/policy";
import { inTransaction } from "@/lib/db";
import type { WorkflowDefinition, WorkflowRecord, WorkflowSummary } from "./designer-types";
import { MAX_WORKFLOW_BYTES, parseWorkflowCatalog, workflowDeleteSchema, workflowId, workflowWriteSchema } from "./validation";

function isAdmin(user: Principal | null): boolean {
  return user?.role === "admin" && user.emailVerified;
}
function assertAdmin(user: Principal | null) {
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (!isAdmin(user)) throw new AccessError(403, "Administrator access required.");
}
function checkId(id: string) {
  if (!workflowId.safeParse(id).success) throw new AccessError(400, "Invalid workflow ID.");
}
function checkSize(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_WORKFLOW_BYTES) {
    throw new AccessError(413, "Workflow is too large.");
  }
}

// This projection must stay explicit: definitions, prompts and reference bytes never belong here.
export async function listWorkflowSummaries(db: Pool, user: Principal | null = null, includeDrafts = false): Promise<WorkflowSummary[]> {
  if (includeDrafts) assertAdmin(user);
  const result = await db.query(`SELECT id, name, description, category, free, published
    FROM workflows WHERE published OR $1::boolean ORDER BY name, id`, [includeDrafts]);
  return result.rows;
}

// Campaign pages get the same public fields as the catalog, never protected definitions.
export async function readPublicWorkflowSummary(db: Pool, id: string): Promise<WorkflowSummary | null> {
  if (!workflowId.safeParse(id).success) return null;
  const result = await db.query(`SELECT id, name, description, category, free, published
    FROM workflows WHERE id = $1 AND published`, [id]);
  return result.rows[0] ?? null;
}

export async function readWorkflow(db: Pool, user: Principal | null, id: string): Promise<WorkflowRecord> {
  checkId(id);
  // One snapshot for classification and content: a concurrent unpublish/reclassification cannot
  // turn a metadata check followed by a second, unguarded SELECT into a reference/content leak.
  const result = await db.query(`SELECT free, published, revision,
    CASE WHEN $2::boolean OR (published AND (free OR $3::boolean)) THEN definition ELSE NULL END AS definition
    FROM workflows WHERE id = $1`, [id, isAdmin(user), hasWorkflowAccess(user)]);
  const row = result.rows[0];
  if (!row || (!row.published && !isAdmin(user))) throw new AccessError(404, "Workflow not found.");
  if (!mayReadWorkflow(user, row)) {
    throw new AccessError(user ? 403 : 401, "Current workflow access is required.");
  }
  return { definition: row.definition, revision: row.revision };
}

export async function writeWorkflow(db: Pool, user: Principal | null, id: string, input: unknown): Promise<WorkflowRecord> {
  assertAdmin(user);
  checkId(id);
  const parsed = workflowWriteSchema.safeParse(input);
  if (!parsed.success || parsed.data.definition.id !== id) throw new AccessError(400, "Invalid workflow. Check its structure, models and template tokens.");
  checkSize(input);
  const { definition, revision } = parsed.data;
  const values = [id, definition.name, definition.description, definition.category ?? "", definition.free ?? false,
    definition.published ?? false, JSON.stringify(definition)];
  // Each mutation is a single atomic statement. No upsert: missing/stale revisions must never
  // overwrite another editor's work or resurrect a deleted workflow.
  const result = revision === null
    ? await db.query(`INSERT INTO workflows (id, name, description, category, free, published, definition)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING RETURNING definition, revision`, values)
    : await db.query(`UPDATE workflows SET name=$2, description=$3, category=$4, free=$5, published=$6,
        definition=$7, revision=gen_random_uuid(), updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND revision=$8::uuid RETURNING definition, revision`, [...values, revision]);
  if (!result.rowCount) throw new AccessError(409, "Workflow changed elsewhere. Reload before saving; your edits have not been applied.");
  return result.rows[0];
}

export async function deleteWorkflow(db: Pool, user: Principal | null, id: string, input: unknown): Promise<void> {
  assertAdmin(user);
  checkId(id);
  const parsed = workflowDeleteSchema.safeParse(input);
  if (!parsed.success) throw new AccessError(400, "A workflow revision is required.");
  const result = await db.query("DELETE FROM workflows WHERE id=$1 AND revision=$2::uuid", [id, parsed.data.revision]);
  if (!result.rowCount) throw new AccessError(409, "Workflow changed elsewhere. Reload before deleting.");
}

// Operator-only CLI migration, never exposed as an HTTP import. Import every item as a draft;
// conflicts roll the entire transaction back. Source files are only read, never modified.
export function prepareWorkflowImport(input: unknown): WorkflowDefinition[] {
  if (!Array.isArray(input)) throw new Error("Invalid catalog");
  const definitions = parseWorkflowCatalog(input.map((item) => ({ ...item, published: false })));
  for (const definition of definitions) checkSize({ definition, revision: null });
  return definitions;
}

export async function importWorkflowCatalog(db: Pool, input: unknown): Promise<number> {
  const definitions = prepareWorkflowImport(input);
  return inTransaction(db, async (client) => {
    for (const d of definitions) {
      await client.query(`INSERT INTO workflows (id, name, description, category, free, published, definition)
        VALUES ($1,$2,$3,$4,$5,false,$6)`, [d.id, d.name, d.description, d.category ?? "", d.free ?? false, JSON.stringify(d)]);
    }
    return definitions.length;
  });
}
