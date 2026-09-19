import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyWorkflow, createStarterWorkflow, createStep } from "../src/lib/workflows/designer-samples";
import { parseWorkflowCatalog, workflowWriteSchema } from "../src/lib/workflows/validation";
import type { WorkflowDefinition } from "../src/lib/workflows/designer-types";

const valid = () => ({ ...createStarterWorkflow(), published: true });
function accepts(definition: WorkflowDefinition) {
  return workflowWriteSchema.safeParse({ definition, revision: null }).success;
}
test("workflow validation defaults new definitions to draft and accepts the published starter", () => {
  const result = workflowWriteSchema.parse({ definition: createEmptyWorkflow(), revision: null });
  assert.equal(result.definition.published, false);
  assert.ok(accepts(valid()));
  assert.ok(!accepts({ ...createEmptyWorkflow(), published: true }));
});
test("workflow validation rejects unregistered/wrong-media models, excessive chains, and nonterminal video", () => {
  for (const modelId of ["arbitrary/provider", "venice/wan-2-7-image-to-video", "venice/seedream-v5-pro"]) {
    const workflow = valid();
    workflow.steps[1].modelId = modelId;
    assert.ok(!accepts(workflow));
  }
  const workflow = valid();
  workflow.steps.push(createStep("video"));
  assert.ok(accepts(workflow));
  workflow.steps.push(createStep("text-overlay"));
  assert.ok(!accepts(workflow));
  assert.ok(!accepts({ ...valid(), steps: Array.from({ length: 17 }, () => createStep("text-overlay")) }));
});
test("publishing rejects unknown/forward tokens, namespace collisions, and invalid variables", () => {
  for (const token of ["missing", "caption", " caption ", "bad_variable"]) {
    const workflow = valid();
    workflow.steps[0].promptTemplate = `{{${token}}}`;
    assert.ok(!accepts(workflow));
    // Drafts can be saved while repairing their template references.
    assert.ok(accepts({ ...workflow, published: false }));
  }
  for (const name of ["Style", "options", "custom"]) {
    const workflow = valid();
    workflow.optionGroups[1].name = name;
    assert.ok(!accepts(workflow));
  }
  for (const variable of ["style", "custom", "Caption", "bad_variable"]) {
    const workflow = valid();
    workflow.steps[0].variable = variable;
    assert.ok(!accepts(workflow));
  }
  const workflow = valid();
  workflow.steps[1].systemPrompt = "{{unknown}}";
  assert.ok(!accepts(workflow));
});
test("workflow validation checks IDs, group references, strict fields, and safe reference formats", () => {
  const workflow = valid();
  workflow.steps[1].usesOptionGroups = ["nonexistent"];
  assert.ok(!accepts(workflow));
  delete workflow.steps[1].usesOptionGroups;
  workflow.steps[1].id = workflow.steps[0].id;
  assert.ok(!accepts(workflow));
  const duplicate = valid();
  duplicate.optionGroups[0].choices.push(duplicate.optionGroups[0].choices[0]);
  assert.ok(!accepts(duplicate));
  const unsafe = valid();
  for (const value of ["https://public.example/reference.png", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)"]) {
    unsafe.optionGroups[0].choices[0].referenceImage = value;
    assert.ok(!accepts(unsafe));
  }
  assert.ok(!workflowWriteSchema.safeParse({ definition: { ...valid(), role: "admin" }, revision: null }).success);
  assert.ok(!workflowWriteSchema.safeParse({ definition: valid() }).success);
  assert.ok(!workflowWriteSchema.safeParse({ definition: valid(), revision: "stale" }).success);
  assert.throws(() => parseWorkflowCatalog([duplicate, duplicate]));
});
