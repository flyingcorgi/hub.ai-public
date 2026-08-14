'use client';

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BriefPromptTemplate,
  loadBriefPromptTemplates,
  persistBriefPromptTemplates,
} from "@/lib/brief-prompt-templates";
import {
  ArticlePromptTemplate,
  loadArticlePromptTemplates,
  persistArticlePromptTemplates,
  findNicoleArticleTemplate,
} from "@/lib/article-prompt-templates";
import { InstructionTemplateDialog } from "@/components/instruction-template-dialog";
import { PipelineStatus, ScriptItem, loadScriptItems, saveScriptItems } from "@/lib/scripts-store";
import { groupByCategory } from "@/lib/group-by-category";
import { DEFAULT_VENICE_MODEL, VENICE_MODEL_STORAGE_KEY, callVenice, getVeniceApiKey } from "@/lib/venice-client";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  Copy,
  Download,
  RotateCcw,
  Sparkles,
  Maximize2,
} from "lucide-react";

const DEFAULT_BRIEF_PROMPT_STORAGE_KEY = "scripts-default-brief-prompt-id";
const BRIEF_APPEND_STORAGE_KEY = "scripts-brief-append-text";
const CONCURRENCY = 3;
const WORKER_START_STAGGER_MS = 200;

// No imposed structure — these are only used when no Prompt Template is picked for that stage.
// Pick (or create) a Prompt Template to fully control what gets sent instead.
const FALLBACK_BRIEF_SYSTEM_PROMPT = "Write a concise content brief for the following topic.";
const FALLBACK_ARTICLE_SYSTEM_PROMPT = "Write a complete article based on the following brief.";

// Used for "Regenerate with new instructions" — a direct edit of the existing brief, not a
// fresh regenerate, so no prompt template or batch append gets mixed in.
const BRIEF_EDIT_SYSTEM_PROMPT =
  "You are directly editing an existing brief per the user's instructions. Apply the requested edit and return the complete revised brief — nothing else, no commentary.";

// Starting point for a manually-authored ("blank") card — the user's own reusable prompt
// skeleton, filled in and edited by hand rather than generated from a topic.
// (Empty in this public build — the real starter skeleton lives only in the private deployment.)
const DEFAULT_BLANK_BRIEF_TEXT = "";

function combineInstructions(base: string, append: string) {
  const trimmedAppend = append.trim();
  if (!trimmedAppend) return base;
  const trimmedBase = base.trim();
  return trimmedBase ? `${trimmedBase}\n\n${trimmedAppend}` : trimmedAppend;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "article"
  );
}

function StatusBadge({ status }: { status: PipelineStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3 w-3" /> Done
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs text-red-500">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      );
    case "generating":
      return (
        <span className="flex items-center gap-1 text-xs text-blue-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Generating…
        </span>
      );
    default:
      return null;
  }
}

function ScriptCard({
  item,
  index,
  articlePromptTemplates,
  onUpdate,
  onRegenerateBrief,
  onGenerateArticle,
  onRequestNewArticleTemplate,
  onRemove,
}: {
  item: ScriptItem;
  index: number;
  articlePromptTemplates: ArticlePromptTemplate[];
  onUpdate: (patch: Partial<ScriptItem>) => void;
  onRegenerateBrief: () => void;
  onGenerateArticle: () => void;
  onRequestNewArticleTemplate: () => void;
  onRemove: () => void;
}) {
  const { toast } = useToast();
  const briefBusy = item.briefStatus === "generating";
  const articleBusy = item.articleStatus === "generating";
  const [briefDialogOpen, setBriefDialogOpen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.article);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Card className={!item.brief && item.briefStatus === "idle" ? "opacity-90" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="shrink-0 text-base font-semibold text-muted-foreground">{index + 1}.</span>
            <Input
              value={item.topic}
              onChange={(e) => onUpdate({ topic: e.target.value })}
              placeholder="Untitled"
              className="h-8 border-none px-1 text-base font-semibold shadow-none focus-visible:ring-1"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={item.briefStatus} />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onRemove}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Brief</Label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setBriefDialogOpen(true)}
              title="Expand"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
          <Textarea
            value={item.brief}
            onChange={(e) => onUpdate({ brief: e.target.value })}
            placeholder={briefBusy ? "Generating…" : "Brief will appear here"}
            className="min-h-[110px] text-sm"
            disabled={briefBusy}
          />
          {item.briefStatus === "failed" && item.briefError && (
            <p className="text-xs text-red-500">{item.briefError}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Regenerate with new instructions</Label>
          <Textarea
            value={item.briefRegenerateInstructions ?? ""}
            onChange={(e) => onUpdate({ briefRegenerateInstructions: e.target.value })}
            placeholder="Optional — extra instructions just for this brief's next regenerate."
            className="min-h-[50px] text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full gap-1"
            disabled={briefBusy}
            onClick={onRegenerateBrief}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        </div>

        <Dialog open={briefDialogOpen} onOpenChange={setBriefDialogOpen}>
          <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
            <DialogHeader>
              <DialogTitle>Brief — {item.topic}</DialogTitle>
            </DialogHeader>
            <Textarea
              value={item.brief}
              onChange={(e) => onUpdate({ brief: e.target.value })}
              placeholder={briefBusy ? "Generating…" : "Brief will appear here"}
              className="min-h-[60vh] flex-1 text-sm"
              disabled={briefBusy}
            />
            <DialogFooter>
              <Button type="button" onClick={() => setBriefDialogOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="space-y-1 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Article prompt template</Label>
            <StatusBadge status={item.articleStatus} />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={item.articlePromptTemplateId ?? ""}
              onValueChange={(value) => onUpdate({ articlePromptTemplateId: value || undefined })}
            >
              <SelectTrigger className="h-8 flex-1">
                <SelectValue placeholder="Default instructions" />
              </SelectTrigger>
              <SelectContent>
                {groupByCategory(articlePromptTemplates).map(({ category, items: templates }) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{category}</SelectLabel>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0"
              title="New article prompt template"
              onClick={onRequestNewArticleTemplate}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={item.articleAppendText ?? ""}
            onChange={(e) => onUpdate({ articleAppendText: e.target.value })}
            placeholder="Extra instructions added on top of the article prompt template above, just for this article."
            className="min-h-[50px] text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full gap-1"
            disabled={!item.brief.trim() || briefBusy || articleBusy}
            onClick={onGenerateArticle}
          >
            {articleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {item.article ? "Regenerate" : "Generate"} Article
          </Button>
          {item.articleStatus === "failed" && item.articleError && (
            <p className="text-xs text-red-500">{item.articleError}</p>
          )}
        </div>

        {(item.article || articleBusy) && (
          <div className="space-y-2">
            <Textarea
              value={item.article}
              onChange={(e) => onUpdate({ article: e.target.value })}
              placeholder={articleBusy ? "Writing…" : ""}
              className="min-h-[220px] text-sm"
              disabled={articleBusy}
            />
            {item.article && (
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={handleCopy}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => downloadText(`${slugify(item.topic)}.txt`, item.article)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download .txt
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TemplateDialogState = { kind: "brief" } | { kind: "article"; itemId: string } | null;

export function ScriptsBuilder() {
  const { toast } = useToast();
  const [topicsInput, setTopicsInput] = useState("");
  const [items, setItems] = useState<ScriptItem[]>([]);
  const [briefPromptTemplates, setBriefPromptTemplates] = useState<BriefPromptTemplate[]>([]);
  const [articlePromptTemplates, setArticlePromptTemplates] = useState<ArticlePromptTemplate[]>([]);
  const [veniceModel, setVeniceModel] = useState(DEFAULT_VENICE_MODEL);
  const [defaultBriefPromptId, setDefaultBriefPromptId] = useState<string | undefined>();
  const [briefAppendText, setBriefAppendText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [isGeneratingBriefs, setIsGeneratingBriefs] = useState(false);
  const [isGeneratingArticles, setIsGeneratingArticles] = useState(false);
  // Which "+" opened the New Prompt Template dialog — determines which list gets the new entry
  // and, for a per-card article template, which item should be pointed at it once saved.
  const [templateDialogState, setTemplateDialogState] = useState<TemplateDialogState>(null);

  useEffect(() => {
    (async () => {
      try {
        const savedItems = await loadScriptItems();
        if (Array.isArray(savedItems)) setItems(savedItems);
      } catch (error) {
        console.error("Failed to load saved scripts:", error);
      }
      setBriefPromptTemplates(loadBriefPromptTemplates());
      setArticlePromptTemplates(loadArticlePromptTemplates());
      const savedModel = localStorage.getItem(VENICE_MODEL_STORAGE_KEY);
      if (savedModel) setVeniceModel(savedModel);
      const savedDefaultBriefPrompt = localStorage.getItem(DEFAULT_BRIEF_PROMPT_STORAGE_KEY);
      if (savedDefaultBriefPrompt) setDefaultBriefPromptId(savedDefaultBriefPrompt);
      const savedBriefAppend = localStorage.getItem(BRIEF_APPEND_STORAGE_KEY);
      if (savedBriefAppend) setBriefAppendText(savedBriefAppend);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveScriptItems(items).catch((error) => console.error("Failed to persist scripts:", error));
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(VENICE_MODEL_STORAGE_KEY, veniceModel);
  }, [veniceModel, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (defaultBriefPromptId) localStorage.setItem(DEFAULT_BRIEF_PROMPT_STORAGE_KEY, defaultBriefPromptId);
  }, [defaultBriefPromptId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(BRIEF_APPEND_STORAGE_KEY, briefAppendText);
  }, [briefAppendText, hydrated]);

  // Warn before closing/reloading the tab while anything is still generating, so an accidental
  // close doesn't lose it partway through.
  useEffect(() => {
    const anyBusy = items.some((i) => i.briefStatus === "generating" || i.articleStatus === "generating");
    if (!anyBusy) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [items]);

  const updateItem = (id: string, patch: Partial<ScriptItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const runBriefFor = async (item: ScriptItem, apiKey: string) => {
    const template = briefPromptTemplates.find((t) => t.id === item.briefPromptTemplateId);
    const baseSystemPrompt = template?.instructions.trim() || FALLBACK_BRIEF_SYSTEM_PROMPT;
    const systemPrompt = combineInstructions(baseSystemPrompt, briefAppendText);
    updateItem(item.id, { briefStatus: "generating", briefError: undefined });
    const response = await callVenice(systemPrompt, `Topic: ${item.topic}`, apiKey, veniceModel);
    if (response.success && response.text) {
      updateItem(item.id, { briefStatus: "completed", brief: response.text.trim() });
    } else {
      updateItem(item.id, { briefStatus: "failed", briefError: response.error ?? "Failed to generate brief" });
    }
  };

  // A direct edit of the existing brief text per the user's instructions — no prompt template or
  // batch append involved, since this isn't "regenerate from scratch," it's "apply this edit."
  const runBriefEditFor = async (item: ScriptItem, apiKey: string) => {
    updateItem(item.id, { briefStatus: "generating", briefError: undefined });
    const response = await callVenice(
      BRIEF_EDIT_SYSTEM_PROMPT,
      `Edit instructions: ${item.briefRegenerateInstructions?.trim()}\n\nCurrent brief:\n${item.brief}`,
      apiKey,
      veniceModel
    );
    if (response.success && response.text) {
      updateItem(item.id, { briefStatus: "completed", brief: response.text.trim() });
    } else {
      updateItem(item.id, { briefStatus: "failed", briefError: response.error ?? "Failed to edit brief" });
    }
  };

  const runArticleFor = async (item: ScriptItem, apiKey: string) => {
    const template = articlePromptTemplates.find((t) => t.id === item.articlePromptTemplateId);
    const baseSystemPrompt = template?.instructions.trim() || FALLBACK_ARTICLE_SYSTEM_PROMPT;
    const systemPrompt = combineInstructions(baseSystemPrompt, item.articleAppendText ?? "");
    updateItem(item.id, { articleStatus: "generating", articleError: undefined });
    const response = await callVenice(
      systemPrompt,
      `Topic: ${item.topic}\n\nBrief:\n${item.brief}`,
      apiKey,
      veniceModel
    );
    if (response.success && response.text) {
      updateItem(item.id, { articleStatus: "completed", article: response.text.trim() });
    } else {
      updateItem(item.id, { articleStatus: "failed", articleError: response.error ?? "Failed to generate article" });
    }
  };

  const runWorkerPool = async <T,>(queue: T[], worker: (item: T) => Promise<void>) => {
    const remaining = [...queue];
    const workers = Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, (_, i) =>
      (async () => {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, i * WORKER_START_STAGGER_MS));
        let next: T | undefined;
        while ((next = remaining.shift())) {
          await worker(next);
        }
      })()
    );
    await Promise.all(workers);
  };

  const handleGenerateBriefs = async () => {
    const topics = topicsInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (topics.length === 0) {
      toast({ title: "No topics", description: "Type at least one topic first.", variant: "destructive" });
      return;
    }
    const apiKey = getVeniceApiKey();
    if (!apiKey) {
      toast({ title: "Missing Venice.ai API key", description: "Set it in API Keys first.", variant: "destructive" });
      return;
    }

    const nicoleTemplate = findNicoleArticleTemplate(articlePromptTemplates);
    const newItems: ScriptItem[] = topics.map((topic) => ({
      id: uuidv4(),
      topic,
      briefStatus: "idle",
      brief: "",
      briefPromptTemplateId: defaultBriefPromptId,
      briefRegenerateInstructions: "",
      articleStatus: "idle",
      article: "",
      articlePromptTemplateId: nicoleTemplate?.id,
      articleAppendText: "",
    }));
    setItems((prev) => [...prev, ...newItems]);
    setTopicsInput("");

    setIsGeneratingBriefs(true);
    await runWorkerPool(newItems, (item) => runBriefFor(item, apiKey));
    setIsGeneratingBriefs(false);
    toast({ title: "Briefs generated", description: `Processed ${newItems.length} topic(s).` });
  };

  const handleAddBlankCard = () => {
    const nicoleTemplate = findNicoleArticleTemplate(articlePromptTemplates);
    const newItem: ScriptItem = {
      id: uuidv4(),
      topic: "",
      briefStatus: "idle",
      brief: DEFAULT_BLANK_BRIEF_TEXT,
      briefRegenerateInstructions: "",
      articleStatus: "idle",
      article: "",
      articlePromptTemplateId: nicoleTemplate?.id,
      articleAppendText: "",
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRegenerateBrief = (item: ScriptItem) => {
    const apiKey = getVeniceApiKey();
    if (!apiKey) {
      toast({ title: "Missing Venice.ai API key", description: "Set it in API Keys first.", variant: "destructive" });
      return;
    }
    if (item.briefRegenerateInstructions?.trim()) {
      void runBriefEditFor(item, apiKey);
    } else {
      void runBriefFor(item, apiKey);
    }
  };

  const handleGenerateArticle = (item: ScriptItem) => {
    const apiKey = getVeniceApiKey();
    if (!apiKey) {
      toast({ title: "Missing Venice.ai API key", description: "Set it in API Keys first.", variant: "destructive" });
      return;
    }
    void runArticleFor(item, apiKey);
  };

  const handleGenerateAllArticles = async () => {
    const apiKey = getVeniceApiKey();
    if (!apiKey) {
      toast({ title: "Missing Venice.ai API key", description: "Set it in API Keys first.", variant: "destructive" });
      return;
    }
    const eligible = items.filter((i) => i.brief.trim() && i.articleStatus !== "generating");
    if (eligible.length === 0) {
      toast({ title: "Nothing to generate", description: "No items have a brief yet.", variant: "destructive" });
      return;
    }
    setIsGeneratingArticles(true);
    await runWorkerPool(eligible, (item) => runArticleFor(item, apiKey));
    setIsGeneratingArticles(false);
    toast({ title: "Articles generated", description: `Processed ${eligible.length} item(s).` });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const activeTemplateList = templateDialogState?.kind === "brief" ? briefPromptTemplates : articlePromptTemplates;

  const templateDialogNoun = templateDialogState?.kind === "brief" ? "brief prompt template" : "article prompt template";

  const handleSaveTemplate = (data: { label: string; instructions: string; category?: string }) => {
    if (!templateDialogState) return;
    if (templateDialogState.kind === "brief") {
      const newTemplate: BriefPromptTemplate = { id: `brief-prompt-${uuidv4()}`, ...data };
      const next = [newTemplate, ...briefPromptTemplates];
      setBriefPromptTemplates(next);
      persistBriefPromptTemplates(next);
      setDefaultBriefPromptId(newTemplate.id);
      toast({ title: "Prompt template saved", description: `Saved "${newTemplate.label}".` });
    } else {
      const newTemplate: ArticlePromptTemplate = { id: `article-prompt-${uuidv4()}`, ...data };
      const next = [newTemplate, ...articlePromptTemplates];
      setArticlePromptTemplates(next);
      persistArticlePromptTemplates(next);
      updateItem(templateDialogState.itemId, { articlePromptTemplateId: newTemplate.id });
      toast({ title: "Prompt template saved", description: `Saved "${newTemplate.label}".` });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <Card className="lg:sticky lg:top-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Scripts</CardTitle>
            <CardDescription className="text-xs">
              Paste topics, generate a brief for each via Venice.ai, edit them, then write out
              full articles from your saved prompt templates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Topics (one per line)</Label>
              <Textarea
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
                placeholder={"How volcanoes form\nThe history of the printing press\n..."}
                className="min-h-[90px] text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Venice model</Label>
              <Input value={veniceModel} onChange={(e) => setVeniceModel(e.target.value)} className="h-8" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Brief prompt template</Label>
              <div className="flex items-center gap-1">
                <Select value={defaultBriefPromptId ?? ""} onValueChange={setDefaultBriefPromptId}>
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupByCategory(briefPromptTemplates).map(({ category, items: templates }) => (
                      <SelectGroup key={category}>
                        <SelectLabel>{category}</SelectLabel>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0"
                  title="New prompt template"
                  onClick={() => setTemplateDialogState({ kind: "brief" })}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Append to brief prompt template</Label>
              <Textarea
                value={briefAppendText}
                onChange={(e) => setBriefAppendText(e.target.value)}
                placeholder="Extra instructions added on top of the brief prompt template above, every time a brief is generated in this batch."
                className="min-h-[50px] text-xs"
              />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button type="button" className="gap-2" disabled={isGeneratingBriefs} onClick={handleGenerateBriefs}>
                {isGeneratingBriefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Briefs
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={isGeneratingArticles || items.length === 0}
                onClick={handleGenerateAllArticles}
              >
                {isGeneratingArticles && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate All Articles
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={handleAddBlankCard}>
                <Plus className="h-4 w-4" />
                Add Blank Card
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scripts yet — paste some topics on the left and generate briefs to get started.
            </p>
          ) : (
            items.map((item, index) => (
              <ScriptCard
                key={item.id}
                item={item}
                index={index}
                articlePromptTemplates={articlePromptTemplates}
                onUpdate={(patch) => updateItem(item.id, patch)}
                onRegenerateBrief={() => handleRegenerateBrief(item)}
                onGenerateArticle={() => handleGenerateArticle(item)}
                onRequestNewArticleTemplate={() => setTemplateDialogState({ kind: "article", itemId: item.id })}
                onRemove={() => removeItem(item.id)}
              />
            ))
          )}
        </div>
      </div>

      <InstructionTemplateDialog
        open={templateDialogState !== null}
        onOpenChange={(open) => !open && setTemplateDialogState(null)}
        initial={null}
        categories={Array.from(new Set(activeTemplateList.map((t) => t.category).filter(Boolean))) as string[]}
        onSave={handleSaveTemplate}
        noun={templateDialogNoun}
      />
    </div>
  );
}
