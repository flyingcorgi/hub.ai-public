'use client';

// Workflow Designer editor: manages the list of WorkflowDefinitions (name, description, option
// groups with prompt fragments + optional attached images, and the ordered step chain) stored
// in SQL. Explicit per-workflow saves carry the last-read revision; conflicts retain local edits.
import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import {
  WorkflowDefinition,
  WorkflowOptionChoice,
  WorkflowOptionGroup,
  WorkflowStep,
  GroupDisplayMode,
  GroupInputType,
  GroupLayout,
  TextOverlayPosition,
  TextAlign,
  TEXT_OVERLAY_DEFAULTS,
  TEXT_FONT_OPTIONS,
  DEFAULT_EDIT_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  modelAcceptsMultipleImages,
  choiceVisual,
  groupSlug,
  llmVariableFor,
  WORKFLOW_CATEGORIES,
} from "@/lib/workflows/designer-types";
import { listVeniceModels, DEFAULT_VENICE_MODEL, type VeniceModel } from "@/lib/venice-client";
import { TextColorControls } from "@/components/workflows/text-gradient-picker";
import { AlbumImagePicker } from "@/components/albums/album-image-picker";
import {
  loadAdminWorkflows,
  saveWorkflowDefinition,
  deleteWorkflowDefinition,
  WorkflowRequestError,
} from "@/lib/workflows/designer-store";
import {
  createChoice,
  createEmptyWorkflow,
  createGroup,
  createStarterWorkflow,
  createStep,
} from "@/lib/workflows/designer-samples";
import { allModels } from "@/lib/models/registry";
import { readImageFileAsDataUrl, readFileAsDataUrl } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Video,
  Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WorkflowWizard } from "./workflow-wizard";

// Models whose schema takes an image input (single `image` or a multi-image `images` array) —
// the only ones usable as chain "image-edit" steps.
const editCapableModels = allModels.filter((model) =>
  model.inputSchema.some(
    (param) => param.type === "image" || (param.type === "array" && param.items?.type === "image")
  )
);

// Models whose schema takes an image input and produce video — the only ones usable as chain
// "video" steps (as opposed to text-to-video models, which take no image input).
const videoCapableModels = allModels.filter(
  (model) => model.mediaType === "video" && model.inputSchema.some((param) => param.type === "image")
);

// Radix Select forbids an empty-string item value — WORKFLOW_CATEGORIES' "Uncategorized" entry
// is "" (see designer-types.ts), so its picker below needs a non-empty stand-in.
const UNCATEGORIZED_VALUE = "__uncategorized__";

function isMultiImageModel(modelId: string): boolean {
  const model = allModels.find((m) => m.id === modelId);
  return Boolean(model && modelAcceptsMultipleImages(model));
}

type DraftUpdater = (updater: (draft: WorkflowDefinition) => void) => void;

type SaveState = "idle" | "saving" | "saved" | "error";

export function WorkflowDesignerEditor({ wizardModel }: { wizardModel?: string } = {}) {
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [llmModels, setLlmModels] = useState<VeniceModel[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const revisions = useRef(new Map<string, string>());
  const savedBodies = useRef(new Map<string, string>());
  const mutating = useRef(false);
  const { toast } = useToast();

  // Venice's chat/text model catalog, for the LLM step's model picker — fetched once and shared
  // by every step row, rather than each step hitting the API on its own. This endpoint only
  // returns text models (see /api/venice-models), so image models never show up here.
  useEffect(() => {
    listVeniceModels().then((res) => {
      if (res.success && res.models) setLlmModels(res.models);
    });
  }, []);

  const active = useMemo(
    () => definitions.find((definition) => definition.id === activeId) ?? null,
    [definitions, activeId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadAdminWorkflows();
        if (cancelled) return;
        revisions.current = new Map(saved.map((r) => [r.definition.id, r.revision]));
        savedBodies.current = new Map(saved.map((r) => [r.definition.id, JSON.stringify(r.definition)]));
        setDefinitions(saved.map((r) => r.definition));
        setActiveId(saved[0]?.definition.id ?? "");
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async () => {
    if (!active || mutating.current || loadFailed) return;
    mutating.current = true;
    setSaveState("saving");
    try {
      const saved = await saveWorkflowDefinition(active, revisions.current.get(active.id) ?? null);
      revisions.current.set(active.id, saved.revision);
      savedBodies.current.set(active.id, JSON.stringify(active));
      setSaveState("saved");
      toast({ title: "Workflow saved" });
    } catch (error) {
      setSaveState("error");
      toast({ title: "Workflow not saved", description: error instanceof WorkflowRequestError ? error.message : "Please try again later. Your edits are still here.", variant: "destructive" });
    } finally { mutating.current = false; }
  };

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (definitions.some((d) => savedBodies.current.get(d.id) !== JSON.stringify(d))) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [definitions]);

  const updateDraft: DraftUpdater = (updater) => {
    if (!active || mutating.current) return;
    setSaveState("idle");
    setDefinitions((prev) =>
      prev.map((definition) => {
        if (definition.id !== active.id) return definition;
        // A deep clone, not a shallow `{ ...definition }` — the updater below mutates nested
        // arrays in place (.push, .splice) for convenience. With a shallow copy those mutations
        // land on the *previous* state's arrays too, and React 18 Strict Mode's dev-mode double
        // invocation of this whole updater then applied every push/splice twice (hence "two
        // empty cards" appearing from one click on Add). Cloning the whole tree first means each
        // invocation mutates its own throwaway copy.
        const draft = structuredClone(definition);
        updater(draft);
        draft.updatedAt = Date.now();
        return draft;
      })
    );
  };

  const addWorkflow = (starter: boolean) => {
    if (mutating.current) return;
    setSaveState("idle");
    const definition = starter ? createStarterWorkflow() : createEmptyWorkflow();
    setDefinitions((prev) => [definition, ...prev]);
    setActiveId(definition.id);
  };

  const exportDraft = () => {
    if (!active) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(active, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `workflow-${active.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const removeWorkflow = async (id: string) => {
    if (mutating.current || !window.confirm("Delete this workflow? This cannot be undone.")) return;
    mutating.current = true;
    setSaveState("saving");
    try {
      const revision = revisions.current.get(id);
      if (revision) await deleteWorkflowDefinition(id, revision);
      revisions.current.delete(id);
      savedBodies.current.delete(id);
      const next = definitions.filter((definition) => definition.id !== id);
      setDefinitions(next);
      if (activeId === id) setActiveId(next[0]?.id ?? "");
      setSaveState("idle");
    } catch (error) {
      setSaveState("error");
      toast({ title: "Workflow not deleted", description: error instanceof WorkflowRequestError ? error.message : "Please try again later.", variant: "destructive" });
    } finally { mutating.current = false; }
  };

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Loading designer...</p>;
  }

  if (loadFailed) return <p role="alert">Unable to load the admin catalog. Sign in as a verified administrator and reload. No changes were saved.</p>;

  return (
    <fieldset disabled={saveState === "saving"} className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">Save each workflow explicitly. New workflows are drafts; check Published and save to release one. Keep a copy of unsaved edits before leaving this page.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeId} onValueChange={(id) => { setActiveId(id); setSaveState("idle"); }}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Pick a workflow" /></SelectTrigger>
          <SelectContent>
            {definitions.map((definition) => (
              <SelectItem key={definition.id} value={definition.id}>
                {definition.name || "Untitled"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => addWorkflow(false)}>
          <Plus className="h-4 w-4" /> Blank
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => addWorkflow(true)}>
          <Plus className="h-4 w-4" /> From example
        </Button>
        {wizardModel && <WorkflowWizard model={wizardModel} onUseDraft={definition => {
          if (mutating.current) return;
          setSaveState("idle");
          setDefinitions(previous => [definition, ...previous]);
          setActiveId(definition.id);
        }} />}
        {active && (
          <Button size="sm" variant="destructive" className="gap-1" onClick={() => removeWorkflow(active.id)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!active} onClick={exportDraft} className="gap-1">
            <Download className="h-4 w-4" /> Export draft
          </Button>
          <span className="text-xs text-muted-foreground">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Workflow saved"}
            {saveState === "idle" && active && savedBodies.current.get(active.id) !== JSON.stringify(active) && "Unsaved changes"}
            {saveState === "error" && "Failed to save"}
          </span>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={saveState === "saving" || !active}
            onClick={persist}
          >
            {saveState === "saving" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saveState === "saved" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {active && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetaCard definition={active} updateDraft={updateDraft} />
          <OptionGroupsCard definition={active} updateDraft={updateDraft} />
          <StepsCard definition={active} updateDraft={updateDraft} llmModels={llmModels} />
        </div>
      )}
    </fieldset>
  );
}

function MetaCard({
  definition,
  updateDraft,
}: {
  definition: WorkflowDefinition;
  updateDraft: DraftUpdater;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Workflow details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="wf-name">Name</Label>
          <Input
            id="wf-name"
            value={definition.name}
            onChange={(e) => updateDraft((draft) => { draft.name = e.target.value; })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wf-desc">Description</Label>
          <Textarea
            id="wf-desc"
            rows={2}
            value={definition.description}
            onChange={(e) => updateDraft((draft) => { draft.description = e.target.value; })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wf-category">Category (shown on the homepage dashboard)</Label>
          <Select
            value={definition.category || UNCATEGORIZED_VALUE}
            onValueChange={(v) =>
              updateDraft((draft) => { draft.category = v === UNCATEGORIZED_VALUE ? undefined : v; })
            }
          >
            <SelectTrigger id="wf-category" className="h-9">
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_CATEGORIES.map((cat) => (
                // Radix Select forbids an empty-string item value, so "Uncategorized" (whose real
                // value is "") is represented by a sentinel here and mapped back to "" on change.
                <SelectItem key={cat.value} value={cat.value || UNCATEGORIZED_VALUE}>
                  {cat.label} — {cat.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-start gap-2 pt-1">
          <Checkbox
            id="wf-before-after"
            checked={definition.generateBeforeAfter ?? false}
            onCheckedChange={(value) =>
              updateDraft((draft) => { draft.generateBeforeAfter = value === true; })
            }
          />
          <Label htmlFor="wf-before-after" className="text-sm font-normal leading-snug">
            Also produce a before/after comparison image (your uploaded photo and the final
            result, side by side). Shown above the regular result — no extra model call, it&apos;s
            just the two images spliced together.
          </Label>
        </div>
        <div className="flex items-start gap-2 pt-1">
          <Checkbox
            id="wf-free"
            checked={definition.free ?? false}
            onCheckedChange={(value) => updateDraft((draft) => { draft.free = value === true; })}
          />
          <Label htmlFor="wf-free" className="text-sm font-normal leading-snug">
            Free to run when published. Otherwise, current paid access is required.
          </Label>
        </div>
        <div className="flex items-start gap-2 pt-1">
          <Checkbox id="wf-published" checked={definition.published ?? false}
            onCheckedChange={(value) => updateDraft((draft) => { draft.published = value === true; })} />
          <Label htmlFor="wf-published" className="text-sm font-normal leading-snug">
            Published — show in the public catalog. Drafts and their reference images are admin-only, even when free.
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}

// A small pill button that inserts {{token}} into a textarea at the current cursor position
// (falling back to appending, if the textarea hasn't been focused yet).
function TokenChips({
  tokens,
  onInsert,
}: {
  tokens: { token: string; label: string }[];
  onInsert: (token: string) => void;
}) {
  if (tokens.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.map((t) => (
        <button
          key={t.token}
          type="button"
          title={t.label}
          onClick={() => onInsert(t.token)}
          className="rounded-full border bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {"{{"}
          {t.token}
          {"}}"}
        </button>
      ))}
    </div>
  );
}

function insertTokenAtCursor(
  textarea: HTMLTextAreaElement | null,
  value: string,
  onChange: (next: string) => void,
  token: string
) {
  const insertText = `{{${token}}}`;
  if (!textarea) {
    onChange(value + insertText);
    return;
  }
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  onChange(value.slice(0, start) + insertText + value.slice(end));
  requestAnimationFrame(() => {
    textarea.focus();
    const caret = start + insertText.length;
    textarea.setSelectionRange(caret, caret);
  });
}

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={onToggle}>
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </Button>
  );
}

function OptionGroupsCard({
  definition,
  updateDraft,
}: {
  definition: WorkflowDefinition;
  updateDraft: DraftUpdater;
}) {
  const { toast } = useToast();

  const addGroup = () =>
    updateDraft((draft) => {
      draft.optionGroups.push(createGroup({ choices: [] }));
    });

  const removeGroup = (groupId: string) =>
    updateDraft((draft) => {
      draft.optionGroups = draft.optionGroups.filter((group) => group.id !== groupId);
      for (const step of draft.steps) {
        step.usesOptionGroups = step.usesOptionGroups?.filter((id) => id !== groupId);
      }
    });

  const setGroupName = (groupId: string, name: string) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (group) group.name = name;
    });

  const patchChoice = (
    groupId: string,
    choiceId: string,
    patch: Partial<WorkflowOptionChoice>
  ) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      const choice = group?.choices.find((c) => c.id === choiceId);
      if (choice) Object.assign(choice, patch);
    });

  const addChoice = (groupId: string) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (group) group.choices.push(createChoice());
    });

  const removeChoice = (groupId: string, choiceId: string) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (group) group.choices = group.choices.filter((c) => c.id !== choiceId);
    });

  const moveChoice = (groupId: string, choiceId: string, direction: -1 | 1) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (!group) return;
      const index = group.choices.findIndex((c) => c.id === choiceId);
      const other = index + direction;
      if (index < 0 || other < 0 || other >= group.choices.length) return;
      const [item] = group.choices.splice(index, 1);
      group.choices.splice(other, 0, item);
    });

  const setGroupDisplayMode = (groupId: string, mode: GroupDisplayMode) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (group) group.displayMode = mode;
    });

  const setGroupInputType = (groupId: string, type: GroupInputType) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (!group) return;
      group.inputType = type;
      // A "toggle" group's on-state (text + optional image) lives in its single choice —
      // create one going in so there's always something to edit, same as a fresh "choices"
      // group isn't expected to start with zero choices either.
      if (type === "toggle" && group.choices.length === 0) {
        group.choices.push(createChoice());
      }
    });

  const setGroupLayout = (groupId: string, layout: GroupLayout) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (group) group.layout = layout;
    });

  const setGroupPlaceholder = (groupId: string, placeholder: string) =>
    updateDraft((draft) => {
      const group = draft.optionGroups.find((g) => g.id === groupId);
      if (group) group.placeholder = placeholder;
    });

  const uploadChoiceReferenceImage = async (groupId: string, choiceId: string, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      patchChoice(groupId, choiceId, { referenceImage: dataUrl });
    } catch (error) {
      console.error("Failed to process reference image:", error);
      toast({
        title: "Couldn't process image",
        description: error instanceof Error ? error.message : "Failed to read the file",
        variant: "destructive",
      });
    }
  };

  const uploadChoiceIcon = async (groupId: string, choiceId: string, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      patchChoice(groupId, choiceId, { icon: dataUrl });
    } catch (error) {
      console.error("Failed to process icon:", error);
      toast({
        title: "Couldn't process icon",
        description: error instanceof Error ? error.message : "Failed to read the file",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">Option groups</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each becomes a picker in the runner. A choice can have a reference image (sent to the
            model) and/or an icon (picker display only) — pick which one each group shows.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={addGroup}>
          <Plus className="h-4 w-4" /> Group
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {definition.optionGroups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No groups yet. Add one, give it a few choices, and reference it in a step&apos;s
            prompt template — either combined via {"{{options}}"} or by its own name.
          </p>
        )}
        {definition.optionGroups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            onRename={(name) => setGroupName(group.id, name)}
            onRemove={() => removeGroup(group.id)}
            onAddChoice={() => addChoice(group.id)}
            onPatchChoice={(choiceId, patch) => patchChoice(group.id, choiceId, patch)}
            onRemoveChoice={(choiceId) => removeChoice(group.id, choiceId)}
            onMoveChoice={(choiceId, direction) => moveChoice(group.id, choiceId, direction)}
            onSetDisplayMode={(mode) => setGroupDisplayMode(group.id, mode)}
            onSetInputType={(type) => setGroupInputType(group.id, type)}
            onSetLayout={(layout) => setGroupLayout(group.id, layout)}
            onSetPlaceholder={(placeholder) => setGroupPlaceholder(group.id, placeholder)}
            onUploadReferenceImage={(choiceId, files) => uploadChoiceReferenceImage(group.id, choiceId, files)}
            onUploadIcon={(choiceId, files) => uploadChoiceIcon(group.id, choiceId, files)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

const DISPLAY_MODE_LABEL: Record<GroupDisplayMode, string> = {
  referenceImage: "Reference image",
  icon: "Icon",
  none: "None (letters)",
};

const INPUT_TYPE_LABEL: Record<GroupInputType, string> = {
  choices: "Choices",
  text: "Text box",
  toggle: "On/Off",
};

const LAYOUT_LABEL: Record<GroupLayout, string> = {
  grid: "Grid",
  dropdown: "Dropdown",
};

function GroupRow({
  group,
  onRename,
  onRemove,
  onAddChoice,
  onPatchChoice,
  onRemoveChoice,
  onMoveChoice,
  onSetDisplayMode,
  onSetInputType,
  onSetLayout,
  onSetPlaceholder,
  onUploadReferenceImage,
  onUploadIcon,
}: {
  group: WorkflowOptionGroup;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddChoice: () => void;
  onPatchChoice: (choiceId: string, patch: Partial<WorkflowOptionChoice>) => void;
  onRemoveChoice: (choiceId: string) => void;
  onMoveChoice: (choiceId: string, direction: -1 | 1) => void;
  onSetDisplayMode: (mode: GroupDisplayMode) => void;
  onSetInputType: (type: GroupInputType) => void;
  onSetLayout: (layout: GroupLayout) => void;
  onSetPlaceholder: (placeholder: string) => void;
  onUploadReferenceImage: (choiceId: string, files: FileList | null) => void;
  onUploadIcon: (choiceId: string, files: FileList | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const displayMode = group.displayMode ?? "referenceImage";
  const inputType = group.inputType ?? "choices";
  const layout = group.layout ?? "grid";

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <Input
          className="h-8 min-w-32 flex-1"
          value={group.name}
          placeholder="Group name"
          onChange={(e) => onRename(e.target.value)}
        />
        <Badge variant="secondary" className="font-mono text-[11px] shrink-0">
          {"{{"}{groupSlug(group)}{"}}"}
        </Badge>
        {inputType === "choices" && (
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
            {group.choices.length} {group.choices.length === 1 ? "choice" : "choices"}
          </span>
        )}
        <Select value={inputType} onValueChange={(v) => onSetInputType(v as GroupInputType)}>
          <SelectTrigger className="h-8 w-32 shrink-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(INPUT_TYPE_LABEL) as GroupInputType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {INPUT_TYPE_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {inputType === "choices" && (
          <Select value={layout} onValueChange={(v) => onSetLayout(v as GroupLayout)}>
            <SelectTrigger className="h-8 w-28 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LAYOUT_LABEL) as GroupLayout[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {LAYOUT_LABEL[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {inputType === "choices" && layout === "grid" && (
          <Select value={displayMode} onValueChange={(v) => onSetDisplayMode(v as GroupDisplayMode)}>
            <SelectTrigger className="h-8 w-40 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DISPLAY_MODE_LABEL) as GroupDisplayMode[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {DISPLAY_MODE_LABEL[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="ghost" className="h-8 text-destructive shrink-0" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {!collapsed && inputType === "text" && (
        <div className="pl-9 space-y-1">
          <Label className="text-xs">Placeholder shown in the runner&apos;s empty textbox (optional)</Label>
          <Input
            className="h-8"
            value={group.placeholder ?? ""}
            placeholder="e.g. Describe the pose..."
            onChange={(e) => onSetPlaceholder(e.target.value)}
          />
        </div>
      )}
      {!collapsed && inputType === "toggle" && (
        <div className="pl-9 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Shown in the runner as a single on/off switch. The text (and image, if attached)
            below are only injected when it&apos;s switched on — off injects nothing.
          </p>
          {group.choices[0] && (
            <ChoiceRow
              choice={group.choices[0]}
              index={0}
              total={1}
              hideRemove
              labelPlaceholder="Switch label"
              onPatch={(patch) => onPatchChoice(group.choices[0].id, patch)}
              onRemove={() => onRemoveChoice(group.choices[0].id)}
              onMove={() => {}}
              onUploadReferenceImage={(files) => onUploadReferenceImage(group.choices[0].id, files)}
              onUploadIcon={(files) => onUploadIcon(group.choices[0].id, files)}
            />
          )}
        </div>
      )}
      {!collapsed && inputType === "choices" && (
        <div className="pl-9 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {layout === "dropdown"
              ? "Picker shows: a plain dropdown of labels."
              : `Picker shows: ${DISPLAY_MODE_LABEL[displayMode].toLowerCase()}${
                  displayMode !== "none" ? " (falls back to letters for any choice missing one)" : ""
                }.`}
          </p>
          {group.choices.map((choice, index) => (
            <ChoiceRow
              key={choice.id}
              choice={choice}
              index={index}
              total={group.choices.length}
              onPatch={(patch) => onPatchChoice(choice.id, patch)}
              onRemove={() => onRemoveChoice(choice.id)}
              onMove={(direction) => onMoveChoice(choice.id, direction)}
              onUploadReferenceImage={(files) => onUploadReferenceImage(choice.id, files)}
              onUploadIcon={(files) => onUploadIcon(choice.id, files)}
            />
          ))}
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={onAddChoice}>
            <Plus className="h-3.5 w-3.5" /> Choice
          </Button>
        </div>
      )}
    </div>
  );
}

function ImageSlot({
  url,
  icon,
  title,
  onUpload,
  onPick,
  onRemove,
}: {
  url: string | undefined;
  icon: ReactNode;
  title: string;
  onUpload: (files: FileList | null) => void;
  onPick: (url: string) => void;
  onRemove: () => void;
}) {
  if (url) {
    return (
      <div className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={title} className="h-9 w-9 rounded border object-cover" />
        <button
          type="button"
          title={`Remove ${title.toLowerCase()}`}
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
        >
          <span className="text-[10px] leading-none">×</span>
        </button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-stretch gap-1">
      <label
        title={title}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
      >
        <Input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onUpload(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        {icon}
      </label>
      <AlbumImagePicker onPick={onPick} triggerLabel="" className="h-9 w-9 p-0" />
    </div>
  );
}

function ChoiceRow({
  choice,
  index,
  total,
  hideRemove = false,
  labelPlaceholder = "Choice label",
  onPatch,
  onRemove,
  onMove,
  onUploadReferenceImage,
  onUploadIcon,
}: {
  choice: WorkflowOptionChoice;
  index: number;
  total: number;
  hideRemove?: boolean;
  labelPlaceholder?: string;
  onPatch: (patch: Partial<WorkflowOptionChoice>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onUploadReferenceImage: (files: FileList | null) => void;
  onUploadIcon: (files: FileList | null) => void;
}) {
  return (
    <div className="rounded-md border border-dashed p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        {total > 1 && (
          <div className="flex flex-col shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-4 w-8 p-0"
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-4 w-8 p-0"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
        )}
        <ImageSlot
          url={choice.referenceImage}
          icon={<ImagePlus className="h-4 w-4" />}
          title="Reference image (sent to the model)"
          onUpload={onUploadReferenceImage}
          onPick={(url) => onPatch({ referenceImage: url })}
          onRemove={() => onPatch({ referenceImage: undefined })}
        />
        <ImageSlot
          url={choice.icon}
          icon={<Sticker className="h-4 w-4" />}
          title="Icon (picker display only)"
          onUpload={onUploadIcon}
          onPick={(url) => onPatch({ icon: url })}
          onRemove={() => onPatch({ icon: undefined })}
        />
        <Input
          className="h-8 flex-1"
          value={choice.label}
          placeholder={labelPlaceholder}
          onChange={(e) => onPatch({ label: e.target.value })}
        />
        {!hideRemove && (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Textarea
        rows={2}
        value={choice.prompt}
        placeholder='Only needed if the injected text should differ from the label above — leave blank to just use "Choice label" as-is'
        onChange={(e) => onPatch({ prompt: e.target.value })}
      />
      <p className="text-[11px] text-muted-foreground">
        Injected as: <span className="font-mono text-foreground">
          {(choice.prompt.trim() || choice.label.trim()) || "(nothing yet — set a label or prompt above)"}
        </span>
        {choice.referenceImage && (
          <> · sent to the model when a step has &quot;attach reference images&quot; on.</>
        )}
      </p>
    </div>
  );
}

function StepsCard({
  definition,
  updateDraft,
  llmModels,
}: {
  definition: WorkflowDefinition;
  updateDraft: DraftUpdater;
  llmModels: VeniceModel[];
}) {
  const addStep = (type: WorkflowStep["type"]) =>
    updateDraft((draft) => {
      draft.steps.push(createStep(type));
    });

  const removeStep = (stepId: string) =>
    updateDraft((draft) => {
      draft.steps = draft.steps.filter((step) => step.id !== stepId);
    });

  const moveStep = (stepId: string, direction: -1 | 1) =>
    updateDraft((draft) => {
      const index = draft.steps.findIndex((step) => step.id === stepId);
      const other = index + direction;
      if (index < 0 || other < 0 || other >= draft.steps.length) return;
      const [item] = draft.steps.splice(index, 1);
      draft.steps.splice(other, 0, item);
    });

  const patchStep = (stepId: string, patch: Partial<WorkflowStep>) =>
    updateDraft((draft) => {
      const step = draft.steps.find((s) => s.id === stepId);
      if (step) Object.assign(step, patch);
    });

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg">Step chain</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Runs top to bottom. Each step can use earlier steps&apos; output — pick a token from
            the list under its prompt.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => addStep("llm")}>
            <Plus className="h-4 w-4" /> LLM step
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => addStep("image-edit")}>
            <Plus className="h-4 w-4" /> Image-edit step
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            title="Draws text onto the image with code (Canvas) — no AI model call"
            onClick={() => addStep("text-overlay")}
          >
            <Plus className="h-4 w-4" /> Text overlay step (no AI)
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            title="Animates the current pipeline image into a short video clip"
            onClick={() => addStep("video")}
          >
            <Plus className="h-4 w-4" /> Video step
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {definition.steps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Steps run in order — LLM text generators (e.g. captions) first, image edits after.
          </p>
        )}
        {definition.steps.map((step, index) => (
          <StepRow
            key={step.id}
            index={index}
            total={definition.steps.length}
            step={step}
            groups={definition.optionGroups}
            allSteps={definition.steps}
            llmModels={llmModels}
            onPatch={(patch) => patchStep(step.id, patch)}
            onRemove={() => removeStep(step.id)}
            onMove={(direction) => moveStep(step.id, direction)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

const LLM_APP_DEFAULT_VALUE = "__app_default__";

const STEP_TYPE_META: Record<
  WorkflowStep["type"],
  { defaultLabel: string; icon: typeof Sparkles; badge: "default" | "secondary"; tag?: string }
> = {
  llm: { defaultLabel: "Text generator", icon: Sparkles, badge: "secondary" },
  "image-edit": { defaultLabel: "Edit round", icon: Wand2, badge: "default" },
  // No AI call here — drawn straight onto the image with the Canvas API, so this needs to read
  // as clearly different from the two model-calling step types above at a glance, even collapsed.
  "text-overlay": { defaultLabel: "Caption overlay", icon: Type, badge: "secondary", tag: "No AI · code" },
  video: { defaultLabel: "Animate video", icon: Video, badge: "default", tag: "Video" },
};

const TEXT_POSITION_LABEL: Record<TextOverlayPosition, string> = {
  top: "Top",
  center: "Center",
  bottom: "Bottom",
};

function StepRow({
  index,
  total,
  step,
  groups,
  allSteps,
  llmModels,
  onPatch,
  onRemove,
  onMove,
}: {
  index: number;
  total: number;
  step: WorkflowStep;
  groups: WorkflowOptionGroup[];
  allSteps: WorkflowStep[];
  llmModels: VeniceModel[];
  onPatch: (patch: Partial<WorkflowStep>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const availableTokens = useMemo(() => {
    const groupTokens = groups.map((g) => ({
      token: groupSlug(g),
      label: `"${g.name || "Untitled group"}" group's chosen fragment`,
    }));
    const priorLlmTokens = allSteps
      .slice(0, index)
      .filter((s) => s.type === "llm")
      .map((s) => ({
        token: llmVariableFor(s),
        label: `Output of the "${s.label || "LLM step"}" step above`,
      }));
    return [
      { token: "options", label: "Combined fragments from the groups checked below" },
      { token: "custom", label: "Free-form instructions typed at run time" },
      ...groupTokens,
      ...priorLlmTokens,
    ];
  }, [groups, allSteps, index]);

  const meta = STEP_TYPE_META[step.type];
  const StepIcon = meta.icon;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          <Badge variant={meta.badge} className="shrink-0 gap-1">
            <StepIcon className="h-3 w-3" />
            {index + 1}
          </Badge>
          <span className="truncate text-sm font-medium">{step.label || meta.defaultLabel}</span>
          {meta.tag && (
            <Badge variant="outline" className="shrink-0 text-[10px] font-normal text-muted-foreground">
              {meta.tag}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 px-2" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="pl-9 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input className="h-8" value={step.label} onChange={(e) => onPatch({ label: e.target.value })} />
            </div>
            {step.type === "llm" && (
              <div className="space-y-1">
                <Label className="text-xs">Variable name ({"{{token}}"}; optional)</Label>
                <Input
                  className="h-8"
                  value={step.variable ?? ""}
                  placeholder={step.label ? step.label.toLowerCase().replace(/\W+/g, "-") : ""}
                  onChange={(e) => onPatch({ variable: e.target.value })}
                />
              </div>
            )}
            {step.type === "llm" && (
              <div className="space-y-1">
                <Label className="text-xs">Show the model the image</Label>
                <div className="flex items-center gap-2 rounded-lg border p-2">
                  <Switch
                    checked={step.seesImage ?? false}
                    onCheckedChange={(checked) => onPatch({ seesImage: checked })}
                  />
                  <span className="text-xs text-muted-foreground">
                    Writes from what is actually in the picture. Needs a vision-capable Venice chat
                    model; the image follows this step&rsquo;s source setting below.
                  </span>
                </div>
              </div>
            )}
            {step.type === "image-edit" && (
              <div className="space-y-1">
                <Label className="text-xs">Edit model</Label>
                <Select value={step.modelId} onValueChange={(v) => onPatch({ modelId: v })}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {editCapableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {step.type === "video" && (
              <div className="space-y-1">
                <Label className="text-xs">Video model</Label>
                <Select value={step.modelId} onValueChange={(v) => onPatch({ modelId: v })}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {videoCapableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Resolution and length are picked at run time (same as image quality), not here.
                </p>
              </div>
            )}
          </div>

          {step.type === "llm" && (
            <div className="space-y-1">
              <Label className="text-xs">LLM model</Label>
              <Select
                value={step.modelId || LLM_APP_DEFAULT_VALUE}
                onValueChange={(v) => onPatch({ modelId: v === LLM_APP_DEFAULT_VALUE ? "" : v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LLM_APP_DEFAULT_VALUE}>App default ({DEFAULT_VENICE_MODEL})</SelectItem>
                  {llmModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {llmModels.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Loading Venice&apos;s model list…</p>
              )}
            </div>
          )}

          {step.type === "llm" && (
            <div className="space-y-1">
              <Label className="text-xs">System prompt (optional)</Label>
              <Input
                className="h-8"
                value={step.systemPrompt ?? ""}
                placeholder="Sets the LLM persona/instructions"
                onChange={(e) => onPatch({ systemPrompt: e.target.value })}
              />
            </div>
          )}

          {step.type === "text-overlay" && (
            <p className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
              No AI model is called for this step — the text below is drawn straight onto the
              image with code (the browser&apos;s Canvas API), so it always comes out exactly as
              typed, styled by the controls beneath it.
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              {step.type === "text-overlay"
                ? "Text to draw on the image"
                : step.type === "video"
                ? "Animation prompt template"
                : "Prompt template"}
            </Label>
            <Textarea
              ref={promptRef}
              rows={3}
              value={step.promptTemplate}
              onChange={(e) => onPatch({ promptTemplate: e.target.value })}
            />
            <TokenChips
              tokens={availableTokens}
              onInsert={(token) =>
                insertTokenAtCursor(
                  promptRef.current,
                  step.promptTemplate,
                  (next) => onPatch({ promptTemplate: next }),
                  token
                )
              }
            />
          </div>

          {step.type === "text-overlay" && (
            <TextOverlayStyleFields step={step} onPatch={onPatch} />
          )}

          {(step.type === "image-edit" || step.type === "text-overlay" || step.type === "video") && (
            <div className="space-y-1">
              <Label className="text-xs">Input image</Label>
              <Select
                value={step.sourceImage ?? "pipeline"}
                onValueChange={(v) => onPatch({ sourceImage: v as typeof step.sourceImage })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pipeline">Pipeline (previous step&apos;s result)</SelectItem>
                  <SelectItem value="upload">Original upload</SelectItem>
                  {(step.type === "image-edit" || step.type === "video") && (
                    <SelectItem value="option">Selected option&apos;s attached image</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {(step.type === "image-edit" || step.type === "text-overlay" || step.type === "video") && groups.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Consumes option groups — feeds {"{{options}}"} above (none checked = all)</Label>
              <div className="flex flex-wrap gap-3">
                {groups.map((group) => {
                  const checked = !step.usesOptionGroups || step.usesOptionGroups.length === 0 || step.usesOptionGroups.includes(group.id);
                  return (
                    <div key={group.id} className="flex items-center gap-1.5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const isChecked = value === true;
                          const current = step.usesOptionGroups ?? [];
                          let next: string[];
                          if (current.length === 0) {
                            next = isChecked ? current : groups.filter((g) => g.id !== group.id).map((g) => g.id);
                          } else {
                            next = isChecked
                              ? [...current, group.id]
                              : current.filter((id) => id !== group.id);
                          }
                          onPatch({ usesOptionGroups: next });
                        }}
                      />
                      <span className="text-xs">{group.name || "Untitled group"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step.type === "image-edit" && isMultiImageModel(step.modelId) && (
            <div className="flex items-start gap-2">
              <Checkbox
                checked={step.attachReferenceImages ?? false}
                onCheckedChange={(value) => onPatch({ attachReferenceImages: value === true })}
              />
              <Label className="text-xs font-normal leading-snug">
                Also send the consumed groups&apos; reference images as extra inputs, alongside the
                image above — this model accepts multiple images per edit.
              </Label>
            </div>
          )}

          <div className="flex items-start gap-2 border-t pt-2">
            <Checkbox
              checked={step.optional ?? false}
              onCheckedChange={(value) => onPatch({ optional: value === true })}
            />
            <Label className="text-xs font-normal leading-snug">
              Let the user turn this step on or off when running — shown as a toggle before Run,
              on by default. Turning it off skips the step
              {step.type === "video"
                ? " (no video is generated)."
                : " (the image just passes through unchanged)."}
            </Label>
          </div>

          {step.type === "text-overlay" && (
            <div className="flex items-start gap-2">
              <Checkbox
                checked={step.userEditable ?? false}
                onCheckedChange={(value) => onPatch({ userEditable: value === true })}
              />
              <Label className="text-xs font-normal leading-snug">
                Let the user adjust this caption&apos;s position/color/size and add an optional
                title when running, instead of only what&apos;s set here.
              </Label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TextOverlayStyleFields({
  step,
  onPatch,
}: {
  step: WorkflowStep;
  onPatch: (patch: Partial<WorkflowStep>) => void;
}) {
  const color = step.textColor ?? TEXT_OVERLAY_DEFAULTS.textColor;
  const position = step.textPosition ?? TEXT_OVERLAY_DEFAULTS.textPosition;
  const align = step.textAlign ?? TEXT_OVERLAY_DEFAULTS.textAlign;
  const fontFamily = step.textFontFamily ?? TEXT_OVERLAY_DEFAULTS.textFontFamily;
  const sizePercent = step.textSizePercent ?? TEXT_OVERLAY_DEFAULTS.textSizePercent;
  const bold = step.textBold ?? TEXT_OVERLAY_DEFAULTS.textBold;
  const strokeColor = step.textStrokeColor ?? TEXT_OVERLAY_DEFAULTS.textStrokeColor;
  const strokeWidth = step.textStrokeWidth ?? TEXT_OVERLAY_DEFAULTS.textStrokeWidth;
  const colorMode = step.textColorMode ?? TEXT_OVERLAY_DEFAULTS.textColorMode;
  const gradientStops = step.textGradientStops ?? TEXT_OVERLAY_DEFAULTS.textGradientStops;
  const emboss = step.textEmboss ?? TEXT_OVERLAY_DEFAULTS.textEmboss;

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-4">
      <TextColorControls
        colorMode={colorMode}
        color={color}
        gradientStops={gradientStops}
        onColorModeChange={(v) => onPatch({ textColorMode: v })}
        onColorChange={(v) => onPatch({ textColor: v })}
        onGradientStopsChange={(v) => onPatch({ textGradientStops: v })}
      />
      <div className="space-y-1">
        <Label className="text-xs">Position</Label>
        <Select value={position} onValueChange={(v) => onPatch({ textPosition: v as TextOverlayPosition })}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(TEXT_POSITION_LABEL) as TextOverlayPosition[]).map((p) => (
              <SelectItem key={p} value={p}>{TEXT_POSITION_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Align</Label>
        <Select value={align} onValueChange={(v) => onPatch({ textAlign: v as TextAlign })}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Font</Label>
        <Select value={fontFamily} onValueChange={(v) => onPatch({ textFontFamily: v })}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEXT_FONT_OPTIONS.map((font) => (
              <SelectItem key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                {font.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Size ({sizePercent}% of width)</Label>
        <Input
          type="number"
          min={1}
          max={30}
          className="h-8"
          value={sizePercent}
          onChange={(e) => onPatch({ textSizePercent: Number(e.target.value) || TEXT_OVERLAY_DEFAULTS.textSizePercent })}
        />
      </div>
      <div className="flex items-end gap-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Checkbox checked={bold} onCheckedChange={(v) => onPatch({ textBold: v === true })} />
          <Label className="text-xs font-normal">Bold</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox checked={emboss} onCheckedChange={(v) => onPatch({ textEmboss: v === true })} />
          <Label className="text-xs font-normal">3D / emboss</Label>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Outline width (0 = off)</Label>
        <Input
          type="number"
          min={0}
          max={10}
          className="h-8"
          value={strokeWidth}
          onChange={(e) => onPatch({ textStrokeWidth: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Outline color</Label>
        <input
          type="color"
          className="h-8 w-full rounded-md border border-input bg-transparent disabled:opacity-50"
          value={strokeColor}
          disabled={strokeWidth <= 0}
          onChange={(e) => onPatch({ textStrokeColor: e.target.value })}
        />
      </div>
    </div>
  );
}
