import assert from "node:assert/strict";
import { test } from "node:test";
import { createStarterWorkflow, createStep } from "../src/lib/workflows/designer-samples";
import { workflowWriteSchema } from "../src/lib/workflows/validation";
import { renderTemplate, sanitizeOverlayText } from "../src/lib/workflows/designer-types";
import type { WorkflowDefinition, WorkflowStep } from "../src/lib/workflows/designer-types";

const valid = () => ({ ...createStarterWorkflow(), published: true });
const accepts = (definition: WorkflowDefinition) =>
  workflowWriteSchema.safeParse({ definition, revision: null }).success;

test("overlay text never rasterises template leftovers or chat-model wrappers", () => {
  // The exact Caption Maker regression: a stray third brace survived token substitution and was
  // drawn into the image.
  const step = { id: "s", type: "text-overlay", label: "Caption overlay", modelId: "", promptTemplate: "{{caption-generator}}}" } as unknown as WorkflowStep;
  const definition = { id: "d", name: "x", description: "", optionGroups: [], steps: [step] } as unknown as WorkflowDefinition;
  const selections = { choices: {}, texts: {}, customInstructions: "" };
  const rendered = renderTemplate(step.promptTemplate, step, definition, selections, { "caption-generator": "Look at you." });

  assert.equal(rendered, "Look at you.}", "renderTemplate still leaves the stray brace");
  assert.equal(sanitizeOverlayText(rendered), "Look at you.");

  // Wrappers a model adds on its own, which no system prompt reliably prevents.
  assert.equal(sanitizeOverlayText('"Pathetic."'), "Pathetic.");
  assert.equal(sanitizeOverlayText("[Pathetic.]"), "Pathetic.");
  assert.equal(sanitizeOverlayText("“Pathetic.”"), "Pathetic.");
  // An unresolved token is dropped rather than drawn.
  assert.equal(sanitizeOverlayText("{{missing}} still here"), "still here");
  // Punctuation inside the caption is left alone.
  assert.equal(sanitizeOverlayText("Say [this] and [that]"), "Say [this] and [that]");
  assert.equal(sanitizeOverlayText("Grade: A+ (finally)"), "Grade: A+ (finally)");
});

test("seesImage is accepted on chat steps and rejected everywhere else", () => {
  // Flag the starter's own chat step in place, so its {{token}} wiring stays intact.
  const onExistingLlm = valid() as WorkflowDefinition;
  const llmStep = onExistingLlm.steps.find((s) => s.type === "llm");
  assert.ok(llmStep, "starter workflow has a chat step");
  llmStep.seesImage = true;
  assert.ok(accepts(onExistingLlm), "a chat step may be shown its input image");

  for (const type of ["image-edit", "text-overlay", "video"] as const) {
    const workflow = valid() as WorkflowDefinition;
    const step = createStep(type);
    step.seesImage = true;
    workflow.steps = [workflow.steps[0], step];
    assert.ok(!accepts(workflow), `${type} must not claim vision input`);
  }
});

test("the shipped Caption Maker publishes cleanly and reads the uploaded photo", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(readFileSync("data/workflow-designer-definitions.json", "utf8"));
  const caption = catalog.find((w: WorkflowDefinition) => /caption/i.test(w.name));
  assert.ok(caption, "Caption Maker is present in the catalog");

  // Would have failed at publish time before the stray brace was removed.
  assert.ok(accepts({ ...caption, published: true }), "Caption Maker passes publish validation");

  const llm = caption.steps.find((s: WorkflowStep) => s.type === "llm");
  assert.equal(llm.seesImage, true);
  assert.equal(llm.sourceImage, "upload");
  const overlay = caption.steps.find((s: WorkflowStep) => s.type === "text-overlay");
  assert.equal(overlay.promptTemplate, "{{caption-generator}}");
});
