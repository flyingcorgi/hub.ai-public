// Generic workflow definitions created and executed by the Workflow Designer. A workflow is an
// ordered chain of steps plus a set of option groups. Option groups are what the runner renders
// as dropdowns; each chosen option can contribute a prompt fragment and/or attach a reference
// image (data URL) to an edit step's payload. Steps are either:
//   - "llm": generate a piece of text (captions, copy, structured descriptions, ...) whose
//     result can be injected into later steps' prompt templates via {{variable}} tokens.
//   - "image-edit": run a registered image-to-image edit model. Its prompt is built from the
//     step's template with tokens replaced ({{options}}, {{custom}}, {{llm variables}}).
//   - "video": run a registered image-to-video model (e.g. Wan 2.7) on the current pipeline
//     image, producing an animated clip. Same prompt-template/sourceImage handling as
//     "image-edit"; the runner sends its own video-specific params (resolution/duration, set
//     globally at run time same as image quality) rather than image ones. Typically the last
//     step in a chain — nothing downstream can meaningfully treat a video as an input image.
// The chain input of an edit or video step is normally the previous step's result ("pipeline"),
// but a step can instead pull the original upload ("upload") or a selected option's attached
// reference image ("option").

import { Model } from "@/lib/types";

// Most workflows attach reference images from option groups alongside the base/pipeline image
// (see WorkflowStep.attachReferenceImages below), so new edit steps default to the multi-image
// model rather than the single-image one.
export const DEFAULT_EDIT_MODEL_ID = "venice/seedream-v5-pro-multi-edit";

// The only registered image-to-video model right now — see "video" steps below.
export const DEFAULT_VIDEO_MODEL_ID = "venice/wan-2-7-image-to-video";

// "text-overlay" draws text straight onto an image with the Canvas API — no model call, so it's
// free, instant, and never garbles the wording the way asking an image model to render text
// tends to. Its promptTemplate (same field llm/image-edit steps use) is the text to draw.
export type WorkflowStepType = "llm" | "image-edit" | "text-overlay" | "video";

export type TextOverlayPosition = "top" | "center" | "bottom";
export type TextAlign = "left" | "center" | "right";
export type TextColorMode = "solid" | "gradient";

// Curated system/web-safe fonts (always available for both the HTML preview and the canvas
// bake, no font-loading required) covering the styles most commonly used for image captions,
// plus one Google Font (Fredoka, loaded globally in layout.tsx) for a bubbly/rounded look —
// drawTextBoxesOnImage() explicitly waits on document.fonts before baking so it rasterizes
// correctly instead of silently falling back to a system font.
export const TEXT_FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Sans-serif (Arial)", value: "Arial, Helvetica, sans-serif" },
  { label: "Bubbly (Fredoka)", value: "'Fredoka', 'Comic Sans MS', sans-serif" },
  { label: "Impact (meme style)", value: "Impact, 'Arial Narrow Bold', sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', 'Comic Sans', cursive" },
  { label: "Courier New (mono)", value: "'Courier New', Courier, monospace" },
];

// Named multi-stop gradients offered as one-click presets, alongside a free "Custom" 2-color
// option — see TextColorControls (text-gradient-picker.tsx) for the picker UI.
export interface GradientPreset {
  id: string;
  label: string;
  stops: string[];
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: "trans", label: "Trans", stops: ["#5BCEFA", "#F5A9B8", "#FFFFFF", "#F5A9B8", "#5BCEFA"] },
  { id: "rainbow", label: "Rainbow", stops: ["#E70000", "#FF8C00", "#FFEF00", "#00811F", "#0044FF", "#760089"] },
];

export const DEFAULT_GRADIENT_STOPS: string[] = ["#ec4899", "#8b5cf6"];

export interface WorkflowOptionChoice {
  id: string;
  label: string;
  // Text fragment injected into the {{options}} token of edit steps that consume this group.
  prompt: string;
  // Optional image payload (data URL) attached when the step's sourceImage is "option" or
  // attachReferenceImages is on — sent to the model. Upscaled on upload to Venice's 256px
  // minimum, since it's a real model input.
  referenceImage?: string;
  // Optional image payload (data URL) shown as this choice's picker icon in the runner — purely
  // decorative, never sent to the model. Independent of referenceImage: a group can show icons
  // in its picker while sending a different (or no) image to the edit model, and vice versa. Not
  // upscaled on upload, since it's never a model input.
  icon?: string;
}

// What each choice's picker card shows in the runner. Undefined/"referenceImage" (the default,
// so existing groups keep behaving the same) prefers referenceImage, falling back to icon, then
// to a two-letter avatar from the label. "icon" prefers icon, falling back the same way. "none"
// always shows the letter avatar, even if images are attached — for groups where the reference
// image exists purely to feed the model and isn't a meaningful thumbnail to show picking it.
export type GroupDisplayMode = "referenceImage" | "icon" | "none";

// "choices" (the default) is a fixed set of pickable options. "text" is a free-form textbox
// instead — the group has no choices at all, just whatever the runner types in at run time,
// still addressable the same way ({{options}}, its own {{group}} token). "toggle" is a single
// on/off switch: choices[0] holds the text/image injected when it's on, and nothing is injected
// when it's off (no fallback to "first choice" the way "choices" groups have).
export type GroupInputType = "choices" | "text" | "toggle";

// How a "choices" group's picker renders in the runner. "grid" (the default) is the clickable
// card grid (see choiceVisual/GroupDisplayMode for what each card shows). "dropdown" is a plain
// <Select> of labels — no images, just simpler/more compact for long lists. Irrelevant for
// "text" groups.
export type GroupLayout = "grid" | "dropdown";

export interface WorkflowOptionGroup {
  id: string;
  name: string;
  choices: WorkflowOptionChoice[];
  displayMode?: GroupDisplayMode;
  inputType?: GroupInputType;
  layout?: GroupLayout;
  // "text" groups only: placeholder shown in the runner's empty textbox.
  placeholder?: string;
}

export type StepSourceImage = "pipeline" | "upload" | "option";

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  // Human label shown in the runner's step list; also serves as the {{variable}} token name
  // for llm steps (lowercased, spaces -> "-"), unless a custom `variable` is set.
  label: string;
  // For image-edit steps: registered model id (defaults to DEFAULT_EDIT_MODEL_ID).
  // For video steps: registered image-to-video model id (defaults to DEFAULT_VIDEO_MODEL_ID).
  // For llm steps: Venice chat model id (defaults to the app's chat default at runtime).
  modelId: string;
  // For image-edit/video: prompt template with tokens. For llm: user-prompt template (same
  // tokens).
  promptTemplate: string;
  // llm only: optional system prompt preceding the rendered user prompt.
  systemPrompt?: string;
  // llm only: explicit token name; if empty, derived from the label.
  variable?: string;
  // llm only: send the step's input image to the chat model as well as the prompt, so the model
  // can describe what it actually sees rather than writing blind from the typed options. Which
  // image is picked follows the same `sourceImage` rule edit steps use (default "pipeline", i.e.
  // the previous step's result, falling back to the upload). Requires a vision-capable Venice
  // chat model — see VISION_CAPABLE_HINT below.
  seesImage?: boolean;
  // image-edit/video only: which option groups feed {{options}}. Empty/undefined = all groups.
  usesOptionGroups?: string[];
  // image-edit/video only (and llm steps with seesImage): where the step's base input image
  // comes from. Default = "pipeline".
  sourceImage?: StepSourceImage;
  // image-edit only, and only meaningful when the step's model accepts multiple images (see
  // isMultiImageModel in designer-editor.tsx): also attach the chosen reference image(s) from
  // usesOptionGroups alongside the base image, instead of the base image being the only input.
  attachReferenceImages?: boolean;
  // text-overlay only — styling for the drawn text. All optional; see TEXT_OVERLAY_DEFAULTS for
  // the values used when unset.
  textColor?: string;
  textPosition?: TextOverlayPosition;
  textAlign?: TextAlign;
  // CSS font-family stack; see TEXT_FONT_OPTIONS for the offered presets.
  textFontFamily?: string;
  // Font size as a percentage of the image's width, so it scales with the image instead of
  // being a fixed pixel count.
  textSizePercent?: number;
  textBold?: boolean;
  // 0 disables the outline entirely.
  textStrokeColor?: string;
  textStrokeWidth?: number;
  // "gradient" fills the text with textGradientStops (a linear left-to-right gradient across
  // the box) instead of the flat textColor. Emoji glyphs render in their native color either
  // way — gradients/solid fill only affects actual text glyphs.
  textColorMode?: TextColorMode;
  textGradientStops?: string[];
  // Stacks several offset copies of the text behind the main fill in the outline color, giving
  // a solid extruded/embossed "pop text" look (the diagonal-shadow style common in caption/meme
  // tools) rather than a flat outline.
  textEmboss?: boolean;
  // Any step type: shown in the runner as an on/off toggle before running, defaulting to on.
  // Turning it off skips the step entirely — an image-edit/text-overlay step just passes its
  // input image through unchanged; an llm step leaves its {{variable}} token unresolved.
  optional?: boolean;
  // text-overlay only: exposes this step's style controls (position/color/size/bold/outline)
  // plus an extra "title" text field in the runner, seeded from this step's own settings above
  // but freely adjustable per run instead of being fixed at design time.
  userEditable?: boolean;
}

// text-overlay steps omit any of the fields above until touched, so the runner and the editor's
// preview both need a single source of truth for "what actually gets drawn if unset".
export const TEXT_OVERLAY_DEFAULTS: Required<
  Pick<
    WorkflowStep,
    | "textColor"
    | "textPosition"
    | "textAlign"
    | "textFontFamily"
    | "textSizePercent"
    | "textBold"
    | "textStrokeColor"
    | "textStrokeWidth"
    | "textColorMode"
    | "textGradientStops"
    | "textEmboss"
  >
> = {
  textColor: "#ec4899",
  textPosition: "bottom",
  textAlign: "center",
  textFontFamily: TEXT_FONT_OPTIONS[0].value,
  textSizePercent: 6,
  textBold: true,
  textStrokeColor: "#000000",
  textStrokeWidth: 2,
  textColorMode: "solid",
  textGradientStops: DEFAULT_GRADIENT_STOPS,
  textEmboss: false,
};

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  optionGroups: WorkflowOptionGroup[];
  steps: WorkflowStep[];
  // When on, running the workflow also produces a side-by-side "Before"/"After" comparison
  // image (original upload vs. final result) — pure client-side canvas compositing, no model
  // call. Shown as a second result stacked above the plain output.
  generateBeforeAfter?: boolean;
  // Server delivery of published definitions/references is public only when free is true.
  // Missing free/published flags default to paid/draft, never an accidental public release.
  free?: boolean;
  // Drafts are visible only to administrators, even when marked free.
  published?: boolean;
  // Category for grouping on the dashboard homepage. One of "feminization", "sissy-lifestyle",
  // "femdom", or unset ("uncategorized").
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export type WorkflowSummary = Pick<WorkflowDefinition, "id" | "name" | "description" | "category" | "free" | "published">;

export interface WorkflowRecord {
  definition: WorkflowDefinition;
  revision: string;
}

export const WORKFLOW_CATEGORIES = [
  { value: "feminization", label: "Feminization", description: "Physical transformation — body, outfit, makeup, hair" },
  { value: "sissy-lifestyle", label: "Sissy Lifestyle", description: "Daily sissy life — fashion, training, habits, captioning" },
  { value: "femdom", label: "Femdom", description: "Dominance & submission — BDSM, chastity, humiliation, pet play" },
  { value: "", label: "Uncategorized", description: "Other / misc workflows" },
] as const;

export interface WorkflowSelections {
  // groupId -> chosen choiceId, for "choices" groups.
  choices: Record<string, string>;
  // groupId -> typed text, for "text" groups.
  texts: Record<string, string>;
  // Free-form extras appended where {{custom}} appears.
  customInstructions: string;
}

export function llmVariableFor(step: WorkflowStep): string {
  const explicit = step.variable?.trim();
  if (explicit) return explicit;
  return step.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "llm";
}

// The {{token}} an option group is addressed by in prompt templates — derived from its name,
// same convention as llmVariableFor. Lets a template pull one specific group's chosen fragment
// (e.g. {{outfit}}) instead of only the combined {{options}} blob.
export function groupSlug(group: WorkflowOptionGroup): string {
  return group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group";
}

// Resolves which image (if any) a choice's picker card should show, given its group's
// displayMode. Shared by the runner's picker and the designer's own preview.
export function choiceVisual(
  group: WorkflowOptionGroup,
  choice: WorkflowOptionChoice
): { type: "image"; url: string } | { type: "letters" } {
  const mode = group.displayMode ?? "referenceImage";
  if (mode === "none") return { type: "letters" };
  const primary = mode === "icon" ? choice.icon : choice.referenceImage;
  const fallback = mode === "icon" ? choice.referenceImage : choice.icon;
  const url = primary || fallback;
  return url ? { type: "image", url } : { type: "letters" };
}

// Whether a "toggle" group is switched on — its single choice (choices[0]) is "selected" the
// same way a "choices" group's picked choice is, via selections.choices, but with no fallback:
// unset/anything else means off, never defaulting to "on".
export function isToggleOn(group: WorkflowOptionGroup, selections: WorkflowSelections): boolean {
  const onChoice = group.choices[0];
  return Boolean(onChoice && selections.choices[group.id] === onChoice.id);
}

// A group's injected text. For "text" groups, whatever was typed at run time. For "toggle"
// groups, the single choice's prompt/label when on, otherwise nothing. For "choices" groups, the
// chosen choice's own prompt fragment if one was written, otherwise its label — so labelling a
// choice "Innie" is enough on its own to inject "Innie" without also having to retype it into a
// separate fragment box, but the fragment field is still there for when the wording you want
// injected should differ from the label shown in the picker.
function chosenPromptFor(group: WorkflowOptionGroup, selections: WorkflowSelections): string {
  if (group.inputType === "text") {
    return (selections.texts[group.id] ?? "").trim();
  }
  if (group.inputType === "toggle") {
    if (!isToggleOn(group, selections)) return "";
    const choice = group.choices[0];
    return choice ? choice.prompt.trim() || choice.label.trim() : "";
  }
  const choice = group.choices.find((c) => c.id === selections.choices[group.id]) ?? group.choices[0];
  if (!choice) return "";
  return choice.prompt.trim() || choice.label.trim();
}

// Renders a step's template. Tokens, in resolution order:
//   {{options}}  — the concatenated chosen fragments for the groups this step consumes
//                  (see usesOptionGroups); "none" if there are none.
//   {{custom}}   — the free-form instructions typed at run time; "none" if blank.
//   {{<group>}}  — one specific option group's chosen fragment by name (see groupSlug),
//                  regardless of whether this step consumes that group for {{options}}.
//   {{<llmVar>}} — a prior llm step's output (see llmVariableFor).
// Unknown tokens are left untouched so the template author sees them.
export function renderTemplate(
  template: string,
  step: WorkflowStep,
  definition: WorkflowDefinition,
  selections: WorkflowSelections,
  llmOutputs: Record<string, string>
): string {
  return template.replace(/\{\{([a-z0-9-]+)\}\}/gi, (match, rawToken) => {
    const token = String(rawToken).toLowerCase();
    if (token === "options") {
      const fragments = relevantOptionGroups(step, definition)
        .map((group) => chosenPromptFor(group, selections))
        .filter(Boolean);
      return fragments.length > 0 ? fragments.join(" ") : "none";
    }
    if (token === "custom") {
      return selections.customInstructions.trim() || "none";
    }
    const group = definition.optionGroups.find((g) => groupSlug(g) === token);
    if (group) return chosenPromptFor(group, selections) || "none";
    const value = llmOutputs[token];
    return value ?? match;
  });
}

// Last-pass cleanup for text that is about to be drawn onto an image (text-overlay steps).
// Unlike a prompt — where a stray character is harmless because a model re-reads it — whatever
// this returns is rasterised into pixels, so authoring slips and chatty model output become
// permanent artifacts. Three real failure modes, in order:
//   1. An unresolved {{token}} (misspelled variable, deleted option group) rendering literally.
//   2. Leftover brace runs from a malformed template, e.g. "{{caption}}}" leaving a dangling "}".
//   3. A chat model wrapping its answer in brackets or quotes ("[Look at you]"), which no
//      system prompt reliably prevents.
// Deliberately conservative: only leading/trailing brace runs are trimmed (no caption legitimately
// starts or ends with a brace) and only ONE layer of matching wrapper is removed, so punctuation
// inside the caption survives untouched.
export function sanitizeOverlayText(rendered: string): string {
  let text = rendered.replace(/\{\{[a-z0-9-]*\}\}/gi, " ");
  text = text.replace(/^[{}\s]+/, "").replace(/[{}\s]+$/, "");

  const wrappers: [string, string][] = [["[", "]"], ["(", ")"], ['"', '"'], ["'", "'"], ["\u201c", "\u201d"], ["\u2018", "\u2019"]];
  for (const [open, close] of wrappers) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length);
      // Only unwrap when the pair actually encloses the whole string, so "[a] and [b]" is kept.
      if (!inner.includes(close)) { text = inner.trim(); break; }
    }
  }

  return text.replace(/\s+/g, " ").trim();
}

// Whether an edit-capable model accepts multiple input images (an `images` array field) rather
// than a single `image` field — see venice/seedream-v5-pro-multi-edit for the motivating case.
export function modelAcceptsMultipleImages(model: Model): boolean {
  return model.inputSchema.some((param) => param.type === "array" && param.items?.type === "image");
}

function relevantOptionGroups(step: WorkflowStep, definition: WorkflowDefinition): WorkflowOptionGroup[] {
  return definition.optionGroups.filter(
    (group) => !step.usesOptionGroups || step.usesOptionGroups.length === 0 || step.usesOptionGroups.includes(group.id)
  );
}

// The chosen reference image (if any) for each option group the step consumes, in group order.
// "text" groups never have one (empty choices). "toggle" groups only contribute their single
// choice's image when switched on — same no-fallback rule as chosenPromptFor.
function chosenReferenceImages(
  step: WorkflowStep,
  definition: WorkflowDefinition,
  selections: WorkflowSelections
): string[] {
  const images: string[] = [];
  for (const group of relevantOptionGroups(step, definition)) {
    if (group.inputType === "toggle") {
      const image = isToggleOn(group, selections) ? group.choices[0]?.referenceImage : undefined;
      if (image) images.push(image);
      continue;
    }
    const choice = group.choices.find((c) => c.id === selections.choices[group.id]) ?? group.choices[0];
    if (choice?.referenceImage) images.push(choice.referenceImage);
  }
  return images;
}

// Resolves the input image(s) for an edit step. The base image comes from sourceImage: the
// chaining pipeline (or the original upload for the first edit), the original upload, or the
// first attached reference image among the groups the step consumes. When
// step.attachReferenceImages is set, every consumed group's chosen reference image is appended
// after the base image too — for models that accept multiple input images
// (see modelAcceptsMultipleImages); ignored otherwise.
export function resolveStepImages(
  step: WorkflowStep,
  definition: WorkflowDefinition,
  selections: WorkflowSelections,
  uploadedImage: string,
  pipelineImage: string | null
): { images: string[]; usedOptionReference: boolean; missingReference: boolean } {
  const pipelineFallback = pipelineImage ?? uploadedImage;
  let baseImage: string;
  let usedOptionReference = false;
  let missingReference = false;

  if (step.sourceImage === "upload") {
    baseImage = uploadedImage;
  } else if (step.sourceImage === "option") {
    const [firstReference] = chosenReferenceImages(step, definition, selections);
    if (firstReference) {
      baseImage = firstReference;
      usedOptionReference = true;
    } else {
      baseImage = pipelineFallback;
      missingReference = true;
    }
  } else {
    baseImage = pipelineFallback;
  }

  const images = [baseImage];
  if (step.attachReferenceImages) {
    for (const reference of chosenReferenceImages(step, definition, selections)) {
      if (!images.includes(reference)) images.push(reference);
    }
  }

  return { images, usedOptionReference, missingReference };
}
