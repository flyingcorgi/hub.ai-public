'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CustomPromptTemplate,
  loadCustomPromptTemplates,
  persistCustomPromptTemplates,
  PROMPT_TEMPLATES,
} from "@/lib/prompt-templates";
import { BatchTemplate, loadBatchTemplates, saveBatchTemplates } from "@/lib/batch-templates";
import { groupByCategory } from "@/lib/group-by-category";
import { modelById } from "@/lib/models/nav-groups";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import {
  ArticlePromptTemplate,
  loadArticlePromptTemplates,
  persistArticlePromptTemplates,
} from "@/lib/article-prompt-templates";
import {
  BriefPromptTemplate,
  loadBriefPromptTemplates,
  persistBriefPromptTemplates,
} from "@/lib/brief-prompt-templates";
import { InstructionTemplateDialog, InstructionTemplate } from "@/components/instruction-template-dialog";
import { Plus, Pencil, ExternalLink, Sparkles, Trash2 } from "lucide-react";

// ---------- Prompt Templates ----------

function PromptTemplateDialog({
  open,
  onOpenChange,
  initial,
  categories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CustomPromptTemplate | null;
  categories: string[];
  onSave: (data: Omit<CustomPromptTemplate, "id">, id?: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loras, setLoras] = useState<{ path: string; scale: number }[]>([]);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setCategory(initial?.category ?? "");
    setPrompt(initial?.prompt ?? "");
    setLoras(initial?.loras ?? []);
  }, [open, initial]);

  const handleSubmit = () => {
    if (!label.trim() || !prompt.trim()) return;
    const nonEmptyLoras = loras.filter((l) => l.path.trim());
    onSave(
      {
        label: label.trim(),
        prompt,
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(nonEmptyLoras.length > 0 ? { loras: nonEmptyLoras } : {}),
      },
      initial?.id
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit template" : "New prompt template"}</DialogTitle>
          <DialogDescription>
            Reusable text (and optional LoRA setup) available from the prompt-template picker on
            the single-model page and in Batch Automation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm">Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Neon Alley" />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="optional, e.g. Portraits"
              list="prompt-template-manager-categories"
            />
            <datalist id="prompt-template-manager-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">LoRA weights ({loras.length}/3)</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loras.length >= 3}
                onClick={() => setLoras([...loras, { path: "", scale: 1 }])}
              >
                Add LoRA
              </Button>
            </div>
            {loras.map((lora, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="LoRA URL or .safetensors path"
                  value={lora.path}
                  className="h-8"
                  onChange={(e) => {
                    const next = [...loras];
                    next[index] = { ...lora, path: e.target.value };
                    setLoras(next);
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={lora.scale}
                  className="h-8 w-20"
                  onChange={(e) => {
                    const next = [...loras];
                    next[index] = { ...lora, scale: Number(e.target.value) };
                    setLoras(next);
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setLoras(loras.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!label.trim() || !prompt.trim()}>
            {initial ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromptTemplatesSection({
  templates,
  setTemplates,
}: {
  templates: CustomPromptTemplate[];
  setTemplates: (next: CustomPromptTemplate[]) => void;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomPromptTemplate | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category).filter(Boolean))) as string[],
    [templates]
  );

  const persist = (next: CustomPromptTemplate[]) => {
    setTemplates(next);
    persistCustomPromptTemplates(next);
  };

  const handleSave = (data: Omit<CustomPromptTemplate, "id">, id?: string) => {
    if (id) {
      persist(templates.map((t) => (t.id === id ? { id, ...data } : t)));
      toast({ title: "Template updated" });
    } else {
      persist([{ id: `custom-${uuidv4()}`, ...data }, ...templates]);
      toast({ title: "Template created" });
    }
  };

  const handleDelete = (id: string) => {
    const template = templates.find((t) => t.id === id);
    persist(templates.filter((t) => t.id !== id));
    if (template) toast({ title: "Template deleted", description: `Deleted "${template.label}".` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} custom, {PROMPT_TEMPLATES.length} built-in
        </p>
        <Button
          type="button"
          size="sm"
          className="gap-1"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No custom templates yet.</p>
      ) : (
        groupByCategory(templates).map(({ category, items }) => (
          <div key={category} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h3>
            <div className="space-y-2">
              {items.map((template) => {
                const isExpanded = expandedId === template.id;
                return (
                  <Card key={template.id}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{template.label}</p>
                            {template.loras && template.loras.length > 0 && (
                              <Badge variant="secondary" className="gap-1">
                                <Sparkles className="h-3 w-3" />
                                {template.loras.length} LoRA{template.loras.length === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>
                          <p
                            className={cn(
                              "cursor-pointer whitespace-pre-line text-xs text-muted-foreground",
                              !isExpanded && "line-clamp-2"
                            )}
                            onClick={() => setExpandedId(isExpanded ? null : template.id)}
                          >
                            {template.prompt}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditing(template);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteConfirmButton label="Delete template" onConfirm={() => handleDelete(template.id)} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Built-in</h3>
        <div className="space-y-2">
          {PROMPT_TEMPLATES.map((template) => (
            <Card key={template.id} className="opacity-70">
              <CardContent className="p-3">
                <p className="text-sm font-medium">{template.label}</p>
                <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{template.prompt}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <PromptTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        categories={categories}
        onSave={handleSave}
      />
    </div>
  );
}

// ---------- Article Format Templates (Scripts tool) ----------

function FormatTemplateSection<T extends InstructionTemplate>({
  templates,
  setTemplates,
  persistFn,
  idPrefix,
  noun,
  nounPlural,
  emptyLabel,
}: {
  templates: T[];
  setTemplates: (next: T[]) => void;
  persistFn: (next: T[]) => void;
  idPrefix: string;
  /** e.g. "article format" or "brief format" */
  noun: string;
  /** e.g. "article formats" or "brief formats" */
  nounPlural: string;
  emptyLabel: string;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category).filter(Boolean))) as string[],
    [templates]
  );

  const persist = (next: T[]) => {
    setTemplates(next);
    persistFn(next);
  };

  const handleSave = (data: Omit<InstructionTemplate, "id">, id?: string) => {
    if (id) {
      persist(templates.map((t) => (t.id === id ? ({ ...t, ...data } as T) : t)));
      toast({ title: "Format updated" });
    } else {
      persist([{ id: `${idPrefix}-${uuidv4()}`, ...data } as T, ...templates]);
      toast({ title: "Format created" });
    }
  };

  const handleDelete = (id: string) => {
    const template = templates.find((t) => t.id === id);
    persist(templates.filter((t) => t.id !== id));
    if (template) toast({ title: "Format deleted", description: `Deleted "${template.label}".` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} {nounPlural} — used by{" "}
          <Link href="/scripts" className="underline">
            Scripts
          </Link>
        </p>
        <Button
          type="button"
          size="sm"
          className="gap-1"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New format
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        groupByCategory(templates).map(({ category, items }) => (
          <div key={category} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h3>
            <div className="space-y-2">
              {items.map((template) => {
                const isExpanded = expandedId === template.id;
                return (
                  <Card key={template.id}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{template.label}</p>
                          <p
                            className={cn(
                              "cursor-pointer whitespace-pre-line text-xs text-muted-foreground",
                              !isExpanded && "line-clamp-2"
                            )}
                            onClick={() => setExpandedId(isExpanded ? null : template.id)}
                          >
                            {template.instructions}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditing(template);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteConfirmButton label="Delete format" onConfirm={() => handleDelete(template.id)} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}

      <InstructionTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        categories={categories}
        onSave={handleSave}
        noun={noun}
      />
    </div>
  );
}

// ---------- Shared rename/category dialog (Batch + Workflow) ----------

function RenameCategoryDialog({
  open,
  onOpenChange,
  initialName,
  initialCategory,
  categories,
  title,
  datalistId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialCategory: string;
  categories: string[];
  title: string;
  datalistId: string;
  onSave: (name: string, category: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setCategory(initialCategory);
  }, [open, initialName, initialCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="optional"
              list={datalistId}
            />
            <datalist id={datalistId}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim(), category.trim());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Batch Templates ----------

function BatchTemplatesSection({
  templates,
  setTemplates,
}: {
  templates: BatchTemplate[];
  setTemplates: (next: BatchTemplate[]) => void;
}) {
  const { toast } = useToast();
  const [renaming, setRenaming] = useState<BatchTemplate | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category).filter(Boolean))) as string[],
    [templates]
  );

  const persist = (next: BatchTemplate[]) => {
    setTemplates(next);
    saveBatchTemplates(next).catch((error) => {
      console.error("Failed to save batch templates:", error);
      toast({ title: "Failed to save", variant: "destructive" });
    });
  };

  const handleRename = (id: string, name: string, category: string) => {
    persist(templates.map((t) => (t.id === id ? { ...t, name, category: category || undefined } : t)));
    toast({ title: "Template updated" });
  };

  const handleDelete = (id: string) => {
    const template = templates.find((t) => t.id === id);
    persist(templates.filter((t) => t.id !== id));
    if (template) toast({ title: "Template deleted", description: `Deleted "${template.name}".` });
  };

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved batch templates yet. Save one from{" "}
        <Link href="/batch/seedream-edit" className="underline">
          Batch Automation
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groupByCategory(templates).map(({ category, items }) => (
        <div key={category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h3>
          <div className="space-y-2">
            {items.map((template) => {
              const model = modelById.get(template.modelId);
              return (
                <Card key={template.id}>
                  <CardContent className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {model?.name ?? template.modelId} · {template.jobs.length} job
                        {template.jobs.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        asChild
                        title="Open in Batch Automation"
                      >
                        <Link href={`/batch/seedream-edit?template=${template.id}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setRenaming(template)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <DeleteConfirmButton label="Delete template" onConfirm={() => handleDelete(template.id)} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {renaming && (
        <RenameCategoryDialog
          open={!!renaming}
          onOpenChange={(open) => !open && setRenaming(null)}
          initialName={renaming.name}
          initialCategory={renaming.category ?? ""}
          categories={categories}
          title="Edit batch template"
          datalistId="batch-template-manager-categories"
          onSave={(name, category) => handleRename(renaming.id, name, category)}
        />
      )}
    </div>
  );
}

// ---------- Top level ----------

export function TemplateManager() {
  const [promptTemplates, setPromptTemplates] = useState<CustomPromptTemplate[]>([]);
  const [batchTemplates, setBatchTemplates] = useState<BatchTemplate[]>([]);
  const [briefPrompts, setBriefPrompts] = useState<BriefPromptTemplate[]>([]);
  const [articlePrompts, setArticlePrompts] = useState<ArticlePromptTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPromptTemplates(loadCustomPromptTemplates());
    setBriefPrompts(loadBriefPromptTemplates());
    setArticlePrompts(loadArticlePromptTemplates());
    loadBatchTemplates()
      .then(setBatchTemplates)
      .catch((error) => console.error("Failed to load batch templates:", error));
    setLoaded(true);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every saved template in one place. Prompt templates can be fully edited here; batch
        templates still get their deep editing done in their own tool — use the{" "}
        <ExternalLink className="inline h-3.5 w-3.5 align-text-bottom" /> icon to jump there.
      </p>

      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">Prompt ({promptTemplates.length})</TabsTrigger>
          <TabsTrigger value="batch">Batch ({batchTemplates.length})</TabsTrigger>
          <TabsTrigger value="brief-prompt">Brief Prompts ({briefPrompts.length})</TabsTrigger>
          <TabsTrigger value="article-prompt">Article Prompts ({articlePrompts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt">
          {loaded && <PromptTemplatesSection templates={promptTemplates} setTemplates={setPromptTemplates} />}
        </TabsContent>
        <TabsContent value="batch">
          {loaded && <BatchTemplatesSection templates={batchTemplates} setTemplates={setBatchTemplates} />}
        </TabsContent>
        <TabsContent value="brief-prompt">
          {loaded && (
            <FormatTemplateSection
              templates={briefPrompts}
              setTemplates={setBriefPrompts}
              persistFn={persistBriefPromptTemplates}
              idPrefix="brief-prompt"
              noun="brief prompt template"
              nounPlural={`brief prompt template${briefPrompts.length === 1 ? "" : "s"}`}
              emptyLabel="No brief prompt templates yet."
            />
          )}
        </TabsContent>
        <TabsContent value="article-prompt">
          {loaded && (
            <FormatTemplateSection
              templates={articlePrompts}
              setTemplates={setArticlePrompts}
              persistFn={persistArticlePromptTemplates}
              idPrefix="article-prompt"
              noun="article prompt template"
              nounPlural={`article prompt template${articlePrompts.length === 1 ? "" : "s"}`}
              emptyLabel="No article prompt templates yet."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
