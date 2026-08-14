// Reusable, freeform system-prompt instructions for the article-writing step of the Scripts
// tool. Kept as its own list, separate from brief prompt templates
// (@/lib/brief-prompt-templates) — briefs and articles call for different instructions, so
// mixing them in one dropdown just adds noise. Also distinct from the older
// @/lib/prompt-templates (used by the single-model generator and Batch Automation for
// image/video prompts) — different tool, different content.
export interface ArticlePromptTemplate {
  id: string;
  label: string;
  instructions: string;
  // Free-form, user-typed — no fixed list. Empty/omitted templates are grouped under
  // "Uncategorized" wherever templates are listed.
  category?: string;
}

const ARTICLE_PROMPT_TEMPLATES_STORAGE_KEY = "article-prompt-templates";

export function loadArticlePromptTemplates(): ArticlePromptTemplate[] {
  try {
    const raw = localStorage.getItem(ARTICLE_PROMPT_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse saved article prompt templates:", error);
    return [];
  }
}

export function persistArticlePromptTemplates(templates: ArticlePromptTemplate[]) {
  try {
    localStorage.setItem(ARTICLE_PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error("Failed to save article prompt templates:", error);
  }
}

// Newly created script cards (from Scripts itself, or from Topic Designer's "Send to Script")
// default their article prompt template to whichever saved template is labeled "Nicole article"
// — the house style used for nearly every script, so most cards need no manual selection at all.
export function findNicoleArticleTemplate(templates: ArticlePromptTemplate[]) {
  return templates.find((t) => t.label.toLowerCase().includes("nicole"));
}
