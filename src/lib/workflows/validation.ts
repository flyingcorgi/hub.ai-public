import { z } from "zod";
import { allModels } from "@/lib/models/registry";
import { groupSlug, llmVariableFor, type WorkflowDefinition } from "./designer-types";
import { templateTokens } from "./template-syntax";

export const MAX_WORKFLOW_BYTES = 16 * 1024 * 1024;

export const workflowId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const id = workflowId;
const text = z.string().max(20000);
const image = z.string().max(8 * 1024 * 1024).regex(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/);
const choice = z.object({ id, label: z.string().max(200), prompt: text, referenceImage: image.optional(), icon: image.optional() }).strict();
const group = z.object({
  id, name: z.string().max(200), choices: z.array(choice).max(100),
  displayMode: z.enum(["referenceImage", "icon", "none"]).optional(),
  inputType: z.enum(["choices", "text", "toggle"]).optional(),
  layout: z.enum(["grid", "dropdown"]).optional(), placeholder: z.string().max(1000).optional(),
}).strict();
const step = z.object({
  id, type: z.enum(["llm", "image-edit", "text-overlay", "video"]), label: z.string().max(200),
  modelId: z.string().max(200), promptTemplate: text, systemPrompt: text.optional(), variable: id.optional(),
  usesOptionGroups: z.array(id).max(32).optional(), sourceImage: z.enum(["pipeline", "upload", "option"]).optional(),
  seesImage: z.boolean().optional(),
  attachReferenceImages: z.boolean().optional(), optional: z.boolean().optional(), userEditable: z.boolean().optional(),
  textColor: z.string().max(100).optional(), textPosition: z.enum(["top", "center", "bottom"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(), textFontFamily: z.string().max(300).optional(),
  textSizePercent: z.number().min(0).max(100).optional(), textBold: z.boolean().optional(),
  textStrokeColor: z.string().max(100).optional(), textStrokeWidth: z.number().min(0).max(100).optional(),
  textColorMode: z.enum(["solid", "gradient"]).optional(), textGradientStops: z.array(z.string().max(100)).max(20).optional(),
  textEmboss: z.boolean().optional(),
}).strict();
export const workflowDefinitionSchema = z.object({
  id, name: z.string().max(200), description: z.string().max(4000),
  optionGroups: z.array(group).max(32), steps: z.array(step).max(16),
  generateBeforeAfter: z.boolean().optional(), free: z.boolean().optional(), published: z.boolean().default(false),
  category: z.enum(["", "feminization", "sissy-lifestyle", "femdom"]).optional(),
  createdAt: z.number().finite().nonnegative(), updatedAt: z.number().finite().nonnegative(),
}).strict().superRefine((workflow, ctx) => {
  const fail = () => ctx.addIssue({ code: "custom", message: "Invalid workflow structure" });
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(workflow.steps.map((s) => s.id)) || !unique(workflow.optionGroups.map((g) => g.id))) fail();
  for (const g of workflow.optionGroups) {
    if (!unique(g.choices.map((c) => c.id)) || (g.inputType === "toggle" && g.choices.length > 1)) fail();
  }
  // Drafts may be incomplete while editing. Publishing requires resolvable tokens and names.
  const tokens = new Set(["options", "custom"]);
  if (workflow.published) {
    if (!workflow.name.trim() || !workflow.steps.length) fail();
    for (const g of workflow.optionGroups) {
      const slug = groupSlug(g);
      if (!g.name.trim() || tokens.has(slug)) fail();
      tokens.add(slug);
    }
  }
  workflow.steps.forEach((s, index) => {
    if (workflow.published) {
      for (const template of [s.promptTemplate, s.systemPrompt ?? ""]) {
        try {
          for (const token of templateTokens(template)) if (!tokens.has(token)) fail();
        } catch { fail(); }
      }
      if (s.type === "llm") {
        const variable = llmVariableFor(s);
        if (!/^[a-z0-9-]+$/.test(variable) || tokens.has(variable)) fail();
        tokens.add(variable);
      }
    }
    if (s.usesOptionGroups?.some((id) => !workflow.optionGroups.some((g) => g.id === id))) fail();
    // Only a chat step can be shown an image; edit/video steps already take one as their input,
    // and a text-overlay step draws locally with no model call at all.
    if (s.seesImage && s.type !== "llm") fail();
    if (s.type === "video" && index !== workflow.steps.length - 1) fail();
    if (s.type !== "image-edit" && s.type !== "video") return;
    const model = allModels.find((m) => m.id === s.modelId);
    if (!model || model.mediaType !== (s.type === "video" ? "video" : "image") ||
        !model.inputSchema.some((p) => p.type === "image" || (p.type === "array" && p.items?.type === "image"))) fail();
  });
});

export const workflowWriteSchema = z.object({
  definition: workflowDefinitionSchema,
  // null means create-only. Existing rows always require the exact last-read revision.
  revision: z.string().uuid().nullable(),
}).strict();
export const workflowDeleteSchema = z.object({ revision: z.string().uuid() }).strict();

export function parseWorkflowCatalog(input: unknown): WorkflowDefinition[] {
  const definitions = z.array(workflowDefinitionSchema).max(100).parse(input);
  if (new Set(definitions.map((d) => d.id)).size !== definitions.length) throw new Error("Duplicate workflow IDs");
  return definitions;
}
