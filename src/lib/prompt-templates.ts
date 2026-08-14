// Shared across the single-model generator and the batch tool so a template saved in either
// place shows up — and can be deleted from — both.
export interface CustomPromptTemplate {
  id: string;
  label: string;
  prompt: string;
  // Free-form, user-typed — no fixed list. Empty/omitted templates are grouped under
  // "Uncategorized" wherever templates are listed.
  category?: string;
  // Captured alongside the prompt when the model being used has a "loras" field with at least
  // one entry filled in, so applying the template later restores the LoRA setup too, not just
  // the text. Omitted for templates that never had any LoRAs to save.
  loras?: { path: string; scale: number }[];
}

const CUSTOM_PROMPT_TEMPLATES_STORAGE_KEY = "custom-prompt-templates";

export function loadCustomPromptTemplates(): CustomPromptTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROMPT_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse saved prompt templates:", error);
    return [];
  }
}

export function persistCustomPromptTemplates(templates: CustomPromptTemplate[]) {
  try {
    localStorage.setItem(CUSTOM_PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error("Failed to save prompt templates:", error);
  }
}

// Built-in starting templates, available alongside whatever the user has saved themselves.
// (Empty in this public build — the real starter set lives only in the private deployment.)
export const PROMPT_TEMPLATES: CustomPromptTemplate[] = [];
