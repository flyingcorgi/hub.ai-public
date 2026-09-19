import { groupSlug, type WorkflowDefinition } from "../../src/lib/workflows/designer-types";
import { workflowDefinitionSchema } from "../../src/lib/workflows/validation";

export const CAPTION_WORKFLOW_ID = "6cec2c52-45b0-4088-aed5-dcadf0a2f285";
export const CAPTION_MODEL = "z-ai-glm-5-3-flash";
const GENERATOR_ID = "922213d3-9ada-41f1-b883-21047994d682";
const OVERLAY_ID = "07cbc68d-73a1-4d09-9104-dcffe55ce027";

// Operator-only targeted repair. Keep the original file/SQL backup; never repair on reads.
// Reject unfamiliar structures rather than guessing at another workflow's configuration.
export function repairCaptionWorkflow(input: WorkflowDefinition): WorkflowDefinition {
  const definition = workflowDefinitionSchema.parse({ ...input, published: false });
  const generator = definition.steps.find(step => step.id === GENERATOR_ID);
  const overlay = definition.steps.find(step => step.id === OVERLAY_ID);
  if (definition.id !== CAPTION_WORKFLOW_ID || generator?.type !== "llm" ||
      generator.variable !== "caption-generator" || overlay?.type !== "text-overlay" ||
      !["{{caption-generator}}}", "{{caption-generator}}"].includes(overlay.promptTemplate) ||
      !definition.optionGroups.some(group => groupSlug(group) === "caption-prompt" && group.inputType === "text")) {
    throw new Error("Unexpected Caption Maker structure. Review in the administrator editor instead.");
  }
  generator.modelId = CAPTION_MODEL;
  generator.promptTemplate = "Caption request:\n{{caption-prompt}}\n\nAdditional instructions:\n{{custom}}";
  generator.systemPrompt = "Write one caption following the user's requested subject, tone, wording and constraints. Additional instructions refine the caption request; 'none' means no additional instructions. Unless the user specifies a different length, aim for 100–200 characters. Return only the caption text, without a heading, explanation, JSON, code fence or wrapper quotes/brackets. Preserve punctuation or brackets explicitly requested as part of the caption. You receive text instructions only, not the uploaded image; do not claim to have inspected it.";
  overlay.promptTemplate = "{{caption-generator}}";
  // Preserve visibility/access flags, other steps, option groups and original creation time.
  return workflowDefinitionSchema.parse({ ...definition, published: input.published ?? false });
}
