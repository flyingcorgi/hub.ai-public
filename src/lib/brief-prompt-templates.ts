// Reusable, freeform system-prompt instructions for the brief-writing step of the Scripts tool.
// Kept as its own list, separate from article prompt templates (@/lib/article-prompt-templates)
// — briefs and articles call for different instructions, so mixing them in one dropdown just
// adds noise. Also distinct from the older @/lib/prompt-templates (used by the single-model
// generator and Batch Automation for image/video prompts) — different tool, different content.
export interface BriefPromptTemplate {
  id: string;
  label: string;
  instructions: string;
  // Free-form, user-typed — no fixed list. Empty/omitted templates are grouped under
  // "Uncategorized" wherever templates are listed.
  category?: string;
}

const BRIEF_PROMPT_TEMPLATES_STORAGE_KEY = "brief-prompt-templates";

export function loadBriefPromptTemplates(): BriefPromptTemplate[] {
  try {
    const raw = localStorage.getItem(BRIEF_PROMPT_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse saved brief prompt templates:", error);
    return [];
  }
}

export function persistBriefPromptTemplates(templates: BriefPromptTemplate[]) {
  try {
    localStorage.setItem(BRIEF_PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error("Failed to save brief prompt templates:", error);
  }
}
