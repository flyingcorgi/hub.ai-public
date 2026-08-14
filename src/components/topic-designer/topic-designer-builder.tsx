'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import {
  callVenice,
  callVeniceChat,
  DEFAULT_TOPIC_DESIGNER_MODEL,
  getVeniceApiKey,
  listVeniceModels,
  VeniceChatMessage,
  VeniceModel,
} from "@/lib/venice-client";
import {
  loadChats,
  saveChats,
  loadReferenceCsvFiles,
  saveReferenceCsvFiles,
  loadMatrixCards,
  saveMatrixCards,
  ReferenceCsvFile,
  TopicChat,
  TopicChatMessage,
  TopicMatrixCard,
  TopicMatrixRow,
  TopicReferenceRow,
} from "@/lib/topic-designer-store";
import {
  DEFAULT_MATRIX_SCHEMA,
  loadMatrixSchema,
  matrixRowsToTsv,
  parseTopicMatrix,
  persistMatrixSchema,
} from "@/lib/topic-matrix";
import { BriefPromptTemplate, loadBriefPromptTemplates } from "@/lib/brief-prompt-templates";
import { findNicoleArticleTemplate, loadArticlePromptTemplates } from "@/lib/article-prompt-templates";
import { ScriptItem, loadScriptItems, saveScriptItems } from "@/lib/scripts-store";
import {
  Send,
  Upload,
  FileText,
  Loader2,
  Bot,
  User,
  Copy,
  Sparkles,
  Table2,
  Pencil,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Trash2,
  FileOutput,
} from "lucide-react";

const TOPIC_DESIGNER_MODEL_STORAGE_KEY = "topic-designer-model-id";
const TOPIC_DESIGNER_SYSTEM_PROMPT_STORAGE_KEY = "topic-designer-system-prompt";
const TOPIC_DESIGNER_ACTIVE_CHAT_STORAGE_KEY = "topic-designer-active-chat-id";
const TOPIC_DESIGNER_BRIEF_TEMPLATE_STORAGE_KEY = "topic-designer-brief-template-id";
// Mirrors Scripts' own default-brief-template key (see DEFAULT_BRIEF_PROMPT_STORAGE_KEY in
// scripts-builder.tsx) so a fresh Topic Designer session starts out pointed at whichever brief
// template the user already relies on there, instead of "None".
const SCRIPTS_DEFAULT_BRIEF_PROMPT_STORAGE_KEY = "scripts-default-brief-prompt-id";

const MAX_CHAT_TITLE_LENGTH = 48;

function buildDefaultSystemPrompt(schema: string[]): string {
  return `You are a topic strategy assistant helping analyze which of the user's past content topics performed best, based on the reference sales/performance data they've uploaded. When the user asks for new topic ideas, ground them in what the data shows worked.

When asked to produce a topic matrix, respond with ONLY a markdown table with exactly these columns, in this order, and no extra commentary before or after: ${schema.join(" | ")}`;
}

function buildGenerateMatrixPrompt(schema: string[]): string {
  return `Based on the topics that performed best in the uploaded reference data, generate a matrix of new topic ideas. Respond with ONLY a markdown table with exactly these columns: ${schema.join(" | ")}`;
}

// No imposed structure — this is only used when no Brief Prompt Template is selected for the
// reference list's "Generate brief" action. Pick a template to fully control what gets sent
// instead (same fallback pattern as the Scripts tool).
const FALLBACK_BRIEF_SYSTEM_PROMPT = "Write a concise content brief for the following topic.";

// Reference CSVs are appended to the system prompt on every turn, in full — Kimi K3's context
// window is large enough that sales data files don't need to be trimmed, and truncating them
// would mean generating topic ideas from incomplete performance data.
function buildCsvContext(files: ReferenceCsvFile[]): string {
  if (files.length === 0) return "";
  return files.map((file) => `--- FILE: ${file.name} ---\n${file.content}`).join("\n\n");
}

function countDataRows(csvText: string): number {
  const lines = csvText.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function truncateTitle(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > MAX_CHAT_TITLE_LENGTH
    ? `${singleLine.slice(0, MAX_CHAT_TITLE_LENGTH)}…`
    : singleLine;
}

function createChat(): TopicChat {
  const now = Date.now();
  return { id: uuidv4(), title: "New chat", titleIsCustom: false, messages: [], createdAt: now, updatedAt: now };
}

// A row created under an older schema may not have a value for the current schema's first
// column (e.g. it was renamed or reordered) — fall back to the first non-empty cell so "Send to
// Script" and toasts always have something reasonable to show instead of an empty title.
function getRowTitle(row: TopicReferenceRow, schema: string[]): string {
  const primary = schema[0] ? row.cells[schema[0]] : undefined;
  if (primary?.trim()) return primary.trim();
  const firstNonEmpty = Object.values(row.cells).find((v) => v?.trim());
  return firstNonEmpty?.trim() || "Untitled topic";
}

// Read-only preview table used inside a chat bubble — the interactive, actionable version of
// this table (with per-topic generate-brief/send-to-script/clear buttons) is ReferenceRowsTable
// below, used only in the saved Topic reference list.
function MatrixPreviewTable({ rows, schema }: { rows: TopicMatrixRow[]; schema: string[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {schema.map((label) => (
              <th key={label} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t align-top">
              {schema.map((label, j) => (
                <td key={label} className={`px-2 py-1.5 ${j === 0 ? "font-medium" : ""}`}>
                  {row[label] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChatBubble({ message, schema }: { message: TopicChatMessage; schema: string[] }) {
  const isUser = message.role === "user";
  const matrixRows = useMemo(
    () => (isUser ? null : parseTopicMatrix(message.content, schema)),
    [isUser, message.content, schema]
  );

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={`min-w-0 max-w-[85%] space-y-1.5 ${isUser ? "items-end" : ""}`}>
        {message.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950">
            {message.error}
          </p>
        ) : matrixRows ? (
          <div className="space-y-1">
            <MatrixPreviewTable rows={matrixRows} schema={schema} />
            <p className="text-[11px] text-muted-foreground">Saved to your topic reference below.</p>
          </div>
        ) : (
          <p
            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              isUser ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {message.content}
          </p>
        )}
      </div>
    </div>
  );
}

function ReferenceRowsTable({
  rows,
  schema,
  onUpdateCell,
  onGenerateBrief,
  onSendToScripts,
  onClearRow,
}: {
  rows: TopicReferenceRow[];
  schema: string[];
  onUpdateCell: (rowId: string, label: string, value: string) => void;
  onGenerateBrief: (row: TopicReferenceRow) => void;
  onSendToScripts: (row: TopicReferenceRow) => void;
  onClearRow: (rowId: string) => void;
}) {
  const columnCount = schema.length + 1;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {schema.map((label) => (
              <th key={label} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">
                {label}
              </th>
            ))}
            <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-t align-top">
                {schema.map((label, j) => (
                  <td key={label} className="p-0">
                    <input
                      value={row.cells[label] ?? ""}
                      onChange={(e) => onUpdateCell(row.id, label, e.target.value)}
                      className={`h-8 w-full min-w-[8rem] bg-transparent px-2 text-xs outline-none focus:relative focus:z-10 focus:ring-1 focus:ring-inset focus:ring-primary ${
                        j === 0 ? "font-medium" : ""
                      }`}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Generate brief"
                      disabled={row.briefStatus === "generating"}
                      onClick={() => onGenerateBrief(row)}
                    >
                      {row.briefStatus === "generating" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Send to Script"
                      onClick={() => onSendToScripts(row)}
                    >
                      <FileOutput className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-500 hover:text-red-500"
                      title="Clear topic"
                      onClick={() => onClearRow(row.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {row.sentToScripts && <p className="mt-0.5 text-[10px] text-muted-foreground">Sent ✓</p>}
                </td>
              </tr>
              {row.briefStatus !== "idle" && (
                <tr className="border-t bg-muted/20">
                  <td colSpan={columnCount} className="px-2 py-1.5">
                    {row.briefStatus === "generating" && (
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Generating brief…
                      </span>
                    )}
                    {row.briefStatus === "failed" && <span className="text-[11px] text-red-500">{row.briefError}</span>}
                    {row.briefStatus === "completed" && row.brief && (
                      <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">{row.brief}</p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchemaEditorDialog({
  open,
  onOpenChange,
  schema,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: string[];
  onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(schema);

  useEffect(() => {
    if (open) setDraft(schema);
  }, [open, schema]);

  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };

  const updateColumn = (index: number, value: string) => {
    const next = [...draft];
    next[index] = value;
    setDraft(next);
  };

  const removeColumn = (index: number) => setDraft(draft.filter((_, i) => i !== index));
  const addColumn = () => setDraft([...draft, ""]);

  const trimmed = draft.map((c) => c.trim()).filter(Boolean);
  const hasDuplicates = new Set(trimmed.map((c) => c.toLowerCase())).size !== trimmed.length;
  const canSave = trimmed.length > 0 && !hasDuplicates;

  const handleSave = () => {
    if (!canSave) return;
    onSave(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit topic columns</DialogTitle>
          <DialogDescription>
            Controls what Kimi is asked for and how the reference table is laid out. Topics
            you&apos;ve already saved keep their original data even if you rename or remove a
            column.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {draft.map((column, index) => (
            <div key={index} className="flex items-center gap-1">
              <Input value={column} onChange={(e) => updateColumn(index, e.target.value)} className="h-8" />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                disabled={index === 0}
                onClick={() => moveColumn(index, -1)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                disabled={index === draft.length - 1}
                onClick={() => moveColumn(index, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-red-500 hover:text-red-500"
                disabled={draft.length <= 1}
                onClick={() => removeColumn(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addColumn}>
            <Plus className="h-3.5 w-3.5" />
            Add column
          </Button>
          {hasDuplicates && <p className="text-xs text-red-500">Column names must be unique.</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TopicDesignerBuilder() {
  const { toast } = useToast();
  const [chats, setChats] = useState<TopicChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const [csvFiles, setCsvFiles] = useState<ReferenceCsvFile[]>([]);
  const [matrixCards, setMatrixCards] = useState<TopicMatrixCard[]>([]);
  const [schema, setSchema] = useState<string[]>(DEFAULT_MATRIX_SCHEMA);
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);
  const [model, setModel] = useState(DEFAULT_TOPIC_DESIGNER_MODEL);
  const [availableModels, setAvailableModels] = useState<VeniceModel[]>([]);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(() => buildDefaultSystemPrompt(DEFAULT_MATRIX_SCHEMA));
  const [briefPromptTemplates, setBriefPromptTemplates] = useState<BriefPromptTemplate[]>([]);
  const [briefTemplateId, setBriefTemplateId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendingChatId, setSendingChatId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];
  const totalTopics = matrixCards.reduce((sum, c) => sum + c.rows.length, 0);

  useEffect(() => {
    (async () => {
      const savedSchema = loadMatrixSchema();
      setSchema(savedSchema);

      try {
        const [savedChats, savedFiles, savedCards] = await Promise.all([
          loadChats(),
          loadReferenceCsvFiles(),
          loadMatrixCards(),
        ]);
        const chatsToUse = savedChats.length > 0 ? savedChats : [createChat()];
        setChats(chatsToUse);
        const savedActiveId = localStorage.getItem(TOPIC_DESIGNER_ACTIVE_CHAT_STORAGE_KEY);
        const activeExists = savedActiveId && chatsToUse.some((c) => c.id === savedActiveId);
        setActiveChatId(activeExists ? (savedActiveId as string) : chatsToUse[0].id);
        setCsvFiles(savedFiles);
        setMatrixCards(savedCards);
      } catch (error) {
        console.error("Failed to load saved Topic Designer data:", error);
      }
      const savedModel = localStorage.getItem(TOPIC_DESIGNER_MODEL_STORAGE_KEY);
      if (savedModel) setModel(savedModel);
      const savedSystemPrompt = localStorage.getItem(TOPIC_DESIGNER_SYSTEM_PROMPT_STORAGE_KEY);
      setSystemPrompt(savedSystemPrompt || buildDefaultSystemPrompt(savedSchema));
      const savedBriefTemplateId =
        localStorage.getItem(TOPIC_DESIGNER_BRIEF_TEMPLATE_STORAGE_KEY) ??
        localStorage.getItem(SCRIPTS_DEFAULT_BRIEF_PROMPT_STORAGE_KEY);
      if (savedBriefTemplateId) setBriefTemplateId(savedBriefTemplateId);
      setBriefPromptTemplates(loadBriefPromptTemplates());
      setHydrated(true);
    })();

    listVeniceModels().then((res) => {
      if (res.success && res.models?.length) {
        setAvailableModels(res.models);
      } else {
        setModelsFailed(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveChats(chats).catch((error) => console.error("Failed to persist chats:", error));
  }, [chats, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveReferenceCsvFiles(csvFiles).catch((error) => console.error("Failed to persist CSV files:", error));
  }, [csvFiles, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveMatrixCards(matrixCards).catch((error) => console.error("Failed to persist matrix cards:", error));
  }, [matrixCards, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    persistMatrixSchema(schema);
  }, [schema, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(TOPIC_DESIGNER_MODEL_STORAGE_KEY, model);
  }, [model, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(TOPIC_DESIGNER_SYSTEM_PROMPT_STORAGE_KEY, systemPrompt);
  }, [systemPrompt, hydrated]);

  useEffect(() => {
    if (!hydrated || !activeChatId) return;
    localStorage.setItem(TOPIC_DESIGNER_ACTIVE_CHAT_STORAGE_KEY, activeChatId);
  }, [activeChatId, hydrated]);

  useEffect(() => {
    if (!hydrated || !briefTemplateId) return;
    localStorage.setItem(TOPIC_DESIGNER_BRIEF_TEMPLATE_STORAGE_KEY, briefTemplateId);
  }, [briefTemplateId, hydrated]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const handleNewChat = () => {
    const chat = createChat();
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
  };

  const handleSwitchChat = (id: string) => setActiveChatId(id);

  const openRenameDialog = () => {
    if (!activeChat) return;
    setRenameValue(activeChat.title);
    setRenameDialogOpen(true);
  };

  const handleRenameChat = (title: string) => {
    if (!activeChat) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const chatId = activeChat.id;
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: trimmed, titleIsCustom: true } : c)));
    setRenameDialogOpen(false);
  };

  const handleDeleteChat = () => {
    if (!activeChat) return;
    const remaining = chats.filter((c) => c.id !== activeChat.id);
    const next = remaining.length > 0 ? remaining : [createChat()];
    setChats(next);
    setActiveChatId(next[0].id);
  };

  const handleUploadCsv = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    try {
      const newFiles: ReferenceCsvFile[] = [];
      for (const file of Array.from(fileList)) {
        const content = await readFileAsText(file);
        newFiles.push({
          id: uuidv4(),
          name: file.name,
          content,
          rowCount: countDataRows(content),
          uploadedAt: Date.now(),
        });
      }
      setCsvFiles((prev) => [...prev, ...newFiles]);
      toast({ title: "Reference data uploaded", description: `Added ${newFiles.length} file(s).` });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not read file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeCsvFile = (id: string) => {
    setCsvFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !activeChat) return;

    const apiKey = getVeniceApiKey();
    if (!apiKey) {
      toast({ title: "Missing Venice.ai API key", description: "Set it in API Keys first.", variant: "destructive" });
      return;
    }

    const chatId = activeChat.id;
    const isFirstMessage = activeChat.messages.length === 0;
    const userMessage: TopicChatMessage = { id: uuidv4(), role: "user", content: trimmed, createdAt: Date.now() };
    const nextMessages = [...activeChat.messages, userMessage];

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: nextMessages,
              title: !c.titleIsCustom && isFirstMessage ? truncateTitle(trimmed) : c.title,
              updatedAt: Date.now(),
            }
          : c
      )
    );
    setInput("");
    setIsSending(true);
    setSendingChatId(chatId);

    const csvContext = buildCsvContext(csvFiles);
    const systemContent = csvContext
      ? `${systemPrompt}\n\nReference data (uploaded CSV files):\n\n${csvContext}`
      : systemPrompt;

    const chatHistory: VeniceChatMessage[] = [
      { role: "system", content: systemContent },
      ...nextMessages.map((m) => ({ role: m.role, content: m.content }) as VeniceChatMessage),
    ];

    const response = await callVeniceChat(chatHistory, apiKey, model);

    if (response.success && response.text) {
      const assistantMessage: TopicChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: response.text.trim(),
        createdAt: Date.now(),
      };
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, messages: [...c.messages, assistantMessage], updatedAt: Date.now() } : c
        )
      );

      const parsedRows = parseTopicMatrix(assistantMessage.content, schema);
      if (parsedRows) {
        const card: TopicMatrixCard = {
          id: uuidv4(),
          createdAt: Date.now(),
          rows: parsedRows.map((cells) => ({ id: uuidv4(), cells, briefStatus: "idle" as const })),
          rawText: assistantMessage.content,
        };
        setMatrixCards((prev) => [card, ...prev]);
        toast({
          title: "Topic matrix saved",
          description: `Saved ${parsedRows.length} topic idea(s) to your reference list.`,
        });
      }
    } else {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: uuidv4(),
                    role: "assistant" as const,
                    content: "",
                    createdAt: Date.now(),
                    error: response.error ?? "Failed to generate a response",
                  },
                ],
                updatedAt: Date.now(),
              }
            : c
        )
      );
    }
    setIsSending(false);
    setSendingChatId(null);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(input);
    }
  };

  const toggleCardCollapsed = (cardId: string) => {
    setMatrixCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, collapsed: !c.collapsed } : c)));
  };

  const removeMatrixCard = (id: string) => {
    setMatrixCards((prev) => prev.filter((c) => c.id !== id));
  };

  const clearRow = (cardId: string, rowId: string) => {
    setMatrixCards((prev) =>
      prev
        .map((c) => (c.id === cardId ? { ...c, rows: c.rows.filter((r) => r.id !== rowId) } : c))
        .filter((c) => c.rows.length > 0)
    );
  };

  const updateRow = (cardId: string, rowId: string, patch: Partial<TopicReferenceRow>) => {
    setMatrixCards((prev) =>
      prev.map((c) =>
        c.id !== cardId ? c : { ...c, rows: c.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }
      )
    );
  };

  const updateCell = (cardId: string, rowId: string, label: string, value: string) => {
    setMatrixCards((prev) =>
      prev.map((c) =>
        c.id !== cardId
          ? c
          : {
              ...c,
              rows: c.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [label]: value } } : r)),
            }
      )
    );
  };

  const handleGenerateBrief = async (cardId: string, row: TopicReferenceRow) => {
    const apiKey = getVeniceApiKey();
    if (!apiKey) {
      toast({ title: "Missing Venice.ai API key", description: "Set it in API Keys first.", variant: "destructive" });
      return;
    }
    updateRow(cardId, row.id, { briefStatus: "generating", briefError: undefined });
    const template = briefPromptTemplates.find((t) => t.id === briefTemplateId);
    const briefSystemPrompt = template?.instructions.trim() || FALLBACK_BRIEF_SYSTEM_PROMPT;
    const userPrompt = schema.map((label) => `${label}: ${row.cells[label] ?? ""}`).join("\n");
    const response = await callVenice(briefSystemPrompt, userPrompt, apiKey, model);
    if (response.success && response.text) {
      updateRow(cardId, row.id, { briefStatus: "completed", brief: response.text.trim() });
    } else {
      updateRow(cardId, row.id, { briefStatus: "failed", briefError: response.error ?? "Failed to generate brief" });
    }
  };

  const handleSendToScripts = async (cardId: string, row: TopicReferenceRow) => {
    try {
      const existing = await loadScriptItems();
      const nicoleTemplate = findNicoleArticleTemplate(loadArticlePromptTemplates());
      const newItem: ScriptItem = {
        id: uuidv4(),
        topic: getRowTitle(row, schema),
        briefStatus: row.brief ? "completed" : "idle",
        brief: row.brief ?? "",
        briefPromptTemplateId: briefTemplateId,
        briefRegenerateInstructions: "",
        articleStatus: "idle",
        article: "",
        articlePromptTemplateId: nicoleTemplate?.id,
        articleAppendText: "",
      };
      await saveScriptItems([...existing, newItem]);
      updateRow(cardId, row.id, { sentToScripts: true });
      toast({ title: "Sent to Scripts", description: `"${newItem.topic}" is ready in Scripts.` });
    } catch (error) {
      toast({
        title: "Failed to send to Scripts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleCopyCard = async (card: TopicMatrixCard) => {
    try {
      await navigator.clipboard.writeText(matrixRowsToTsv(card.rows.map((r) => r.cells), schema));
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Topic Designer</CardTitle>
              <CardDescription className="text-xs">
                Chat with Kimi about your reference sales data to design new topic ideas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Model</Label>
                {availableModels.length > 0 ? (
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {!availableModels.some((m) => m.id === model) && (
                        <SelectItem value={model}>{model}</SelectItem>
                      )}
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="h-8"
                    placeholder="Venice model id"
                  />
                )}
                {modelsFailed && (
                  <p className="text-[11px] text-muted-foreground">
                    Couldn&apos;t load the model list — type an id manually.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">System instructions</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[90px] text-xs"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reference data</CardTitle>
              <CardDescription className="text-xs">
                Upload past sales/performance CSVs. They stay saved here and get included every
                time you chat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                multiple
                className="hidden"
                onChange={(e) => void handleUploadCsv(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload CSV
              </Button>

              {csvFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No reference files uploaded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {csvFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{file.name}</p>
                          <p className="text-[11px] text-muted-foreground">{file.rowCount} rows</p>
                        </div>
                      </div>
                      <DeleteConfirmButton label="Remove file" onConfirm={() => removeCsvFile(file.id)} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Chats</CardTitle>
              <CardDescription className="text-xs">
                Optional — keep separate conversations for different topic explorations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-1">
                <Select value={activeChatId ?? ""} onValueChange={handleSwitchChat}>
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chats.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0"
                  title="Rename chat"
                  onClick={openRenameDialog}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <DeleteConfirmButton label="Delete chat" onConfirm={handleDeleteChat} />
              </div>
              <Button type="button" variant="outline" className="w-full gap-2" onClick={handleNewChat}>
                <Plus className="h-3.5 w-3.5" />
                New chat
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex h-[600px] flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ask Kimi about your reference data, or use &quot;Generate topic matrix&quot; below
                    to draft new ideas from what&apos;s worked.
                  </p>
                ) : (
                  messages.map((message) => (
                    <ChatBubble key={message.id} message={message} schema={schema} />
                  ))
                )}
                {isSending && sendingChatId === activeChatId && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Kimi is thinking…
                  </div>
                )}
                <div ref={scrollAnchorRef} />
              </div>

              <div className="space-y-2 border-t pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setInput(buildGenerateMatrixPrompt(schema))}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate topic matrix
                </Button>
                <div className="flex items-end gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Ask Kimi anything about your reference data, or give it instructions…"
                    className="min-h-[60px] flex-1 text-sm"
                    disabled={isSending}
                  />
                  <Button
                    type="button"
                    size="icon"
                    disabled={isSending || !input.trim()}
                    onClick={() => void handleSend(input)}
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Topic reference ({totalTopics})</h2>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  title="Edit columns"
                  onClick={() => setSchemaDialogOpen(true)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
              {briefPromptTemplates.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Label className="text-[11px] text-muted-foreground">Brief template</Label>
                  <Select value={briefTemplateId ?? ""} onValueChange={setBriefTemplateId}>
                    <SelectTrigger className="h-7 w-[160px] text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {briefPromptTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {matrixCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every topic matrix Kimi generates gets saved here automatically.
              </p>
            ) : (
              <div className="space-y-3">
                {matrixCards.map((card) => (
                  <Card key={card.id}>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          onClick={() => toggleCardCollapsed(card.id)}
                        >
                          {card.collapsed ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          {card.rows.length} topic{card.rows.length === 1 ? "" : "s"} ·{" "}
                          {new Date(card.createdAt).toLocaleString()}
                        </button>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Copy as TSV"
                            onClick={() => void handleCopyCard(card)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteConfirmButton label="Delete matrix" onConfirm={() => removeMatrixCard(card.id)} />
                        </div>
                      </div>
                      {!card.collapsed && (
                        <ReferenceRowsTable
                          rows={card.rows}
                          schema={schema}
                          onUpdateCell={(rowId, label, value) => updateCell(card.id, rowId, label, value)}
                          onGenerateBrief={(row) => void handleGenerateBrief(card.id, row)}
                          onSendToScripts={(row) => void handleSendToScripts(card.id, row)}
                          onClearRow={(rowId) => clearRow(card.id, rowId)}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRenameChat(renameValue);
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!renameValue.trim()} onClick={() => handleRenameChat(renameValue)}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SchemaEditorDialog
        open={schemaDialogOpen}
        onOpenChange={setSchemaDialogOpen}
        schema={schema}
        onSave={setSchema}
      />
    </div>
  );
}
