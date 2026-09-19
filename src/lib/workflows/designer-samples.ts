// Factories for new Workflow Designer definitions. The starter example ships deliberately
// generic (non-domain) content so a blank app still demonstrates option groups that inject
// prompt fragments, a chained llm step, and an edit step's {{options}}/{{llm}} tokens.
import { v4 as uuidv4 } from "uuid";
import {
  WorkflowDefinition,
  WorkflowOptionChoice,
  WorkflowOptionGroup,
  WorkflowStep,
  DEFAULT_EDIT_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
} from "@/lib/workflows/designer-types";

export function createEmptyWorkflow(name = "Untitled Workflow"): WorkflowDefinition {
  const now = Date.now();
  return {
    id: uuidv4(),
    name,
    description: "",
    optionGroups: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createChoice(partial?: Partial<WorkflowOptionChoice>): WorkflowOptionChoice {
  return { id: uuidv4(), label: "", prompt: "", ...partial };
}

export function createGroup(partial?: Partial<WorkflowOptionGroup>): WorkflowOptionGroup {
  return { id: uuidv4(), name: "New Group", choices: [], ...partial };
}

const STEP_LABEL: Record<WorkflowStep["type"], string> = {
  llm: "Text generator",
  "image-edit": "Edit round",
  "text-overlay": "Caption overlay",
  video: "Animate video",
};

export function createStep(type: WorkflowStep["type"], partial?: Partial<WorkflowStep>): WorkflowStep {
  const base: WorkflowStep = {
    id: uuidv4(),
    type,
    label: STEP_LABEL[type],
    // "" for llm means "use the app's chat default" (see DEFAULT_VENICE_MODEL in
    // venice-client.ts) — an edit model id here was a bug: every new LLM step silently defaulted
    // to an image-editing model id, which the LLM call would then reject. text-overlay doesn't
    // call any model at all, so its modelId is simply unused.
    modelId: type === "image-edit" ? DEFAULT_EDIT_MODEL_ID : type === "video" ? DEFAULT_VIDEO_MODEL_ID : "",
    promptTemplate: "",
    // Most edit steps combine the base image with a chosen option's reference image — on by
    // default since DEFAULT_EDIT_MODEL_ID is the multi-image model. No-op for models/groups
    // that don't have reference images attached.
    ...(type === "image-edit" ? { attachReferenceImages: true } : {}),
    ...(type === "text-overlay" || type === "video" ? { sourceImage: "pipeline" } : {}),
  };
  return { ...base, ...partial };
}

export function createStarterWorkflow(): WorkflowDefinition {
  const now = Date.now();
  const group1: WorkflowOptionGroup = {
    id: uuidv4(),
    name: "Style",
    choices: [
      { id: uuidv4(), label: "Cartoon", prompt: "flat cartoon style with bold outlines" },
      { id: uuidv4(), label: "Painting", prompt: "hand-painted watercolor style" },
    ],
  };
  const group2: WorkflowOptionGroup = {
    id: uuidv4(),
    name: "Color palette",
    choices: [
      { id: uuidv4(), label: "Warm", prompt: "warm sunset color palette" },
      { id: uuidv4(), label: "Cool", prompt: "cool blues and purples color palette" },
    ],
  };
  const llmStep: WorkflowStep = {
    id: uuidv4(),
    type: "llm",
    label: "Caption",
    variable: "caption",
    modelId: "",
    systemPrompt: "You write short, vivid captions for concept art.",
    promptTemplate: "Write a one-sentence caption for the transformed image.",
  };
  const editStep: WorkflowStep = {
    id: uuidv4(),
    type: "image-edit",
    label: "Stylize",
    modelId: DEFAULT_EDIT_MODEL_ID,
    promptTemplate: "Stylize the image. Style: {{options}}. Extra: {{custom}}. Caption idea: {{caption}}.",
    sourceImage: "upload",
    attachReferenceImages: true,
  };
  return {
    id: uuidv4(),
    name: "Example: Stylizer (generic)",
    description: "Placeholders showing the structure — replace with your own groups, steps and prompts.",
    optionGroups: [group1, group2],
    steps: [llmStep, editStep],
    createdAt: now,
    updatedAt: now,
  };
}
