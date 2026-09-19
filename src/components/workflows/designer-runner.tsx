'use client';

// Executes WorkflowDesigner definitions: renders one dropdown per option group, uploads the
// start photo (pipeline seed), accepts free-form instructions, then runs the chained steps —
// LLM text generators first, image edits after — with per-step status and downloadable results.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  WorkflowDefinition,
  WorkflowSummary,
  WorkflowOptionGroup,
  WorkflowSelections,
  TextAlign,
  TextColorMode,
  choiceVisual,
  isToggleOn,
  llmVariableFor,
  sanitizeOverlayText,
  renderTemplate,
  resolveStepImages,
  modelAcceptsMultipleImages,
  TEXT_OVERLAY_DEFAULTS,
  TEXT_FONT_OPTIONS,
} from "@/lib/workflows/designer-types";
import { workflowDefinitionSchema } from "@/lib/workflows/validation";
import { TextColorControls } from "@/components/workflows/text-gradient-picker";
import { EmojiPickerButton } from "@/components/workflows/emoji-picker";
import { LockCard } from "@/components/nowpayments/workflow-access-gate";
import { ACCOUNT_CHANGED_EVENT } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  loadWorkflowSummaries,
  loadWorkflowDefinition,
  WorkflowRequestError,
  WORKFLOWS_CHANGED_EVENT,
} from "@/lib/workflows/designer-store";
import {
  callVenice,
  VENICE_MODEL_STORAGE_KEY,
  DEFAULT_VENICE_MODEL,
} from "@/lib/venice-client";
import { generateVenice } from "@/lib/actions/generate-venice";
import { VeniceKeySetup } from "@/components/venice-key-setup";
import { readBrowserApiKey } from "@/lib/browser-api-keys";
import { modelById } from "@/lib/models/nav-groups";
import { createBeforeAfterImage, drawTextBoxesOnImage, anchorToPercent, downscaleForVision } from "@/lib/image-utils";
import { AlbumImagePicker } from "@/components/albums/album-image-picker";
import { SaveToAlbumButton } from "@/components/albums/save-to-album-button";
import { Image } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  GripHorizontal,
  Loader2,
  MinusCircle,
  Pencil,
  Plus,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";

type StepStatus = {
  state: "pending" | "processing" | "completed" | "skipped" | "awaiting-input" | "failed";
  error?: string;
};

// Renders a group's choices as a grid of clickable cards — a real image (reference image or
// icon, per the group's displayMode set in the designer) or a two-letter avatar when there's no
// image to show (or the group is explicitly set to "none").
function ChoiceGridPicker({
  group,
  value,
  onChange,
}: {
  group: WorkflowOptionGroup;
  value: string;
  onChange: (choiceId: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {group.choices.map((choice) => {
        const selected = value === choice.id;
        const visual = choiceVisual(group, choice);
        return (
          <button
            key={choice.id}
            type="button"
            onClick={() => onChange(choice.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors",
              selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary/50"
            )}
          >
            {visual.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={visual.url}
                alt={choice.label || "Choice icon"}
                className="h-14 w-14 rounded object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                {choice.label ? choice.label.slice(0, 2).toUpperCase() : "—"}
              </div>
            )}
            <span className="line-clamp-1 text-xs">{choice.label || "Untitled"}</span>
          </button>
        );
      })}
    </div>
  );
}

// Renders one option group's input — a free-form textbox for "text" groups, a plain <Select>
// for "choices" groups explicitly set to the "dropdown" layout, and the card grid otherwise.
function OptionGroupInput({
  group,
  selections,
  onChoiceChange,
  onTextChange,
}: {
  group: WorkflowOptionGroup;
  selections: WorkflowSelections;
  onChoiceChange: (choiceId: string) => void;
  onTextChange: (value: string) => void;
}) {
  if (group.inputType === "text") {
    return (
      <Textarea
        rows={2}
        placeholder={group.placeholder || "Type here..."}
        value={selections.texts[group.id] ?? ""}
        onChange={(e) => onTextChange(e.target.value)}
      />
    );
  }

  if (group.inputType === "toggle") {
    const onChoice = group.choices[0];
    const on = isToggleOn(group, selections);
    const visual = onChoice ? choiceVisual(group, onChoice) : { type: "letters" as const };
    return (
      <div className="flex items-center gap-2 rounded-lg border p-2">
        <Switch
          checked={on}
          onCheckedChange={(checked) => onChoiceChange(checked && onChoice ? onChoice.id : "")}
        />
        {visual.type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={visual.url} alt="" className="h-8 w-8 rounded object-cover" />
        )}
        <span className="text-sm">{onChoice?.label || "On"}</span>
      </div>
    );
  }

  if (group.layout === "dropdown") {
    return (
      <Select value={selections.choices[group.id] ?? ""} onValueChange={onChoiceChange}>
        <SelectTrigger><SelectValue placeholder="Pick an option" /></SelectTrigger>
        <SelectContent>
          {group.choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.label || "Untitled"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <ChoiceGridPicker
      group={group}
      value={selections.choices[group.id] ?? ""}
      onChange={onChoiceChange}
    />
  );
}

function AlignButtons({ value, onChange }: { value: TextAlign; onChange: (align: TextAlign) => void }) {
  return (
    <div className="flex gap-1">
      {([
        ["left", AlignLeft],
        ["center", AlignCenter],
        ["right", AlignRight],
      ] as [TextAlign, typeof AlignLeft][]).map(([align, Icon]) => (
        <Button
          key={align}
          type="button"
          size="sm"
          variant={value === align ? "default" : "outline"}
          className="h-8 w-8 p-0"
          onClick={() => onChange(align)}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  );
}

interface CaptionBox {
  id: string;
  text: string;
  // Center point of the box, as a percentage of the image (0-100) — what dragging changes.
  xPercent: number;
  yPercent: number;
  // Box width as a percentage of the image width — what resizing changes. Height is never
  // stored: the box always grows to fit exactly what's typed, so it never scrolls.
  widthPercent: number;
  align: TextAlign;
  color: string;
  colorMode: TextColorMode;
  gradientStops: string[];
  fontFamily: string;
  sizePercent: number;
  bold: boolean;
  strokeColor: string;
  strokeWidth: number;
  emboss: boolean;
}

interface CaptionEditState {
  stepId: string;
  imageUrl: string;
  boxes: CaptionBox[];
  resumeIndex: number;
}

function isGradientBox(box: CaptionBox): boolean {
  return box.colorMode === "gradient" && box.gradientStops.length >= 2;
}

// Approximates the canvas bake's emboss effect (a stack of solid diagonally-offset copies) with
// a matching stack of hard-edged text-shadows.
function buildEmbossTextShadow(box: CaptionBox, previewFontSize: number): string | undefined {
  if (!box.emboss) return undefined;
  // Matches image-utils.ts's drawTextBox: total depth kept to ~10% of font size so the shadow
  // stack reads as a crisp 3D edge instead of overwhelming the front fill.
  const stepPx = Math.max(1, previewFontSize * 0.02);
  const steps = 5;
  return Array.from({ length: steps }, (_, i) => `${(i + 1) * stepPx}px ${(i + 1) * stepPx}px 0 ${box.strokeColor}`).join(", ");
}

// Native <textarea>/<input> glyph rendering doesn't respect background-clip:text in this engine
// (confirmed: the same CSS works fine on a plain <div>) — so gradient mode hides the real glyphs
// here (color: transparent, no shadow — it'd double up with the overlay's) and GradientTextOverlay
// below draws the actual gradient+emboss text on top instead. Solid mode needs no overlay at all.
function buildTextareaStyle(box: CaptionBox, previewFontSize: number): CSSProperties {
  const gradient = isGradientBox(box);
  return {
    fontFamily: box.fontFamily,
    fontWeight: box.bold ? 700 : 400,
    fontSize: `${previewFontSize}px`,
    lineHeight: 1.25,
    textAlign: box.align,
    WebkitTextStroke: box.strokeWidth > 0 ? `${Math.max(1, box.strokeWidth * 0.6)}px ${box.strokeColor}` : undefined,
    color: gradient ? "transparent" : box.color,
    caretColor: gradient ? box.gradientStops[0] : box.color,
    textShadow: gradient ? undefined : buildEmbossTextShadow(box, previewFontSize),
  };
}

// A non-interactive overlay, sized to exactly match the textarea's content box, showing the real
// gradient+emboss text on top of the (invisible-glyph) textarea beneath it.
function GradientTextOverlay({ box, previewFontSize }: { box: CaptionBox; previewFontSize: number }) {
  if (!isGradientBox(box)) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words rounded border border-transparent"
      style={{
        fontFamily: box.fontFamily,
        fontWeight: box.bold ? 700 : 400,
        fontSize: `${previewFontSize}px`,
        lineHeight: 1.25,
        textAlign: box.align,
        backgroundImage: `linear-gradient(90deg, ${box.gradientStops.join(", ")})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        // The property that actually controls glyph fill under background-clip:text on
        // Blink/WebKit — plain `color` alone leaves the gradient invisible.
        WebkitTextFillColor: "transparent",
        color: "transparent",
        textShadow: buildEmbossTextShadow(box, previewFontSize),
      }}
    >
      {box.text}
    </div>
  );
}

// One draggable, resizable, directly-editable text box on top of the preview image. Nothing is
// written to the actual image until "Apply caption" bakes every box with drawTextBoxesOnImage.
function CaptionBoxOverlay({
  box,
  selected,
  containerWidth,
  onSelect,
  onTextChange,
  onDragMove,
  onDragEnd,
  onResizeMove,
  registerRef,
}: {
  box: CaptionBox;
  selected: boolean;
  containerWidth: number;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  onResizeMove: (clientX: number) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grows to fit whatever's typed, at the box's current width — so there's never a
  // scrollbar, and resizing the box (which changes wrap width) immediately repositions/reflows
  // the text to match.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [box.text, box.widthPercent, box.sizePercent, containerWidth]);

  // Approximates the canvas bake's (sizePercent% of the full-resolution image width) at
  // whatever size the preview <img> actually renders at, so the preview looks close to the
  // final result instead of a differently-scaled placeholder.
  const previewFontSize = containerWidth > 0 ? Math.max(8, (box.sizePercent / 100) * containerWidth) : 16;

  return (
    <div
      ref={registerRef}
      className="absolute flex flex-col items-center gap-1"
      style={{
        left: `${box.xPercent}%`,
        top: `${box.yPercent}%`,
        transform: "translate(-50%, -50%)",
        width: `${box.widthPercent}%`,
      }}
      onPointerDown={onSelect}
    >
      <div
        title="Drag to reposition"
        className={cn(
          "touch-none flex h-7 w-11 shrink-0 cursor-move items-center justify-center rounded text-white",
          selected ? "bg-primary" : "bg-black/70"
        )}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect();
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          onDragMove(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          onDragEnd();
        }}
        onPointerCancel={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          onDragEnd();
        }}
      >
        <GripHorizontal className="h-3.5 w-3.5" />
      </div>
      <div className="relative w-full">
        <textarea
          ref={textareaRef}
          value={box.text}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={onSelect}
          rows={1}
          className={cn(
            "w-full resize-none overflow-hidden rounded border bg-black/10 outline-none",
            selected ? "border-primary" : "border-dashed border-white/70"
          )}
          style={buildTextareaStyle(box, previewFontSize)}
        />
        <GradientTextOverlay box={box} previewFontSize={previewFontSize} />
        <div
          title="Drag to resize width"
          className="touch-none absolute -right-3.5 top-1/2 flex h-9 w-6 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded bg-black/70 text-white"
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect();
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            onResizeMove(e.clientX);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          <GripHorizontal className="h-3.5 w-3.5 rotate-90" />
        </div>
      </div>
    </div>
  );
}

// The interactive "image editor" step: the generated image with every caption box rendered as
// draggable, resizable, directly-editable HTML overlays on top of it. Click a box to select it
// and edit its style below; "Add text box" adds another independent one.
function CaptionDragEditor({
  edit,
  onChangeBox,
  onAddBox,
  onAddEmojiBox,
  onRemoveBox,
  onApply,
  onCancel,
  applying,
}: {
  edit: CaptionEditState;
  onChangeBox: (boxId: string, patch: Partial<CaptionBox>) => void;
  onAddBox: () => void;
  onAddEmojiBox: (emoji: string) => void;
  onRemoveBox: (boxId: string) => void;
  onApply: () => void;
  onCancel: () => void;
  applying: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(edit.boxes[0]?.id ?? null);
  // Canva-style snap guides — populated while dragging, cleared on drop. Percent-of-container
  // positions to draw as full-length lines; empty when nothing's currently aligned.
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  // Measures synchronously on mount (container width doesn't depend on the <img> finishing its
  // load, only on the surrounding card layout, so this is correct immediately) and keeps a
  // ResizeObserver + window resize listener as a live-update path for whichever of the two the
  // host browser actually fires.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const SNAP_PX = 6;

  // Snaps the dragged box's left/center/right edge (x) and top/center/bottom edge (y) to the
  // nearest matching edge of any other box, or the image's own edges/center, within a pixel
  // threshold — the same "alignment line" behavior design tools like Canva use, so boxes can be
  // lined up exactly by feel instead of by typing in numbers.
  const snapPosition = (boxId: string, rawXPercent: number, rawYPercent: number) => {
    const container = containerRef.current;
    const draggedBox = edit.boxes.find((b) => b.id === boxId);
    if (!container || !draggedBox) return { xPercent: rawXPercent, yPercent: rawYPercent, guides: { v: [], h: [] } as { v: number[]; h: number[] } };

    const containerRect = container.getBoundingClientRect();
    const draggedHeightPercent = boxRefs.current[boxId]
      ? (boxRefs.current[boxId]!.getBoundingClientRect().height / containerRect.height) * 100
      : 0;
    const xThreshold = (SNAP_PX / containerRect.width) * 100;
    const yThreshold = (SNAP_PX / containerRect.height) * 100;

    const candidateXs: Record<string, number> = {
      left: rawXPercent - draggedBox.widthPercent / 2,
      center: rawXPercent,
      right: rawXPercent + draggedBox.widthPercent / 2,
    };
    const candidateYs: Record<string, number> = {
      top: rawYPercent - draggedHeightPercent / 2,
      center: rawYPercent,
      bottom: rawYPercent + draggedHeightPercent / 2,
    };

    const targetXs: number[] = [0, 50, 100];
    const targetYs: number[] = [0, 50, 100];
    for (const other of edit.boxes) {
      if (other.id === boxId) continue;
      targetXs.push(other.xPercent - other.widthPercent / 2, other.xPercent, other.xPercent + other.widthPercent / 2);
      const otherEl = boxRefs.current[other.id];
      if (otherEl) {
        const otherHeightPercent = (otherEl.getBoundingClientRect().height / containerRect.height) * 100;
        targetYs.push(other.yPercent - otherHeightPercent / 2, other.yPercent, other.yPercent + otherHeightPercent / 2);
      }
    }

    let xPercent = rawXPercent;
    let bestXGuide: number | null = null;
    let bestXDist = xThreshold;
    for (const value of Object.values(candidateXs)) {
      for (const target of targetXs) {
        const dist = Math.abs(value - target);
        if (dist < bestXDist) {
          bestXDist = dist;
          bestXGuide = target;
          xPercent = target - (value - rawXPercent);
        }
      }
    }

    let yPercent = rawYPercent;
    let bestYGuide: number | null = null;
    let bestYDist = yThreshold;
    for (const value of Object.values(candidateYs)) {
      for (const target of targetYs) {
        const dist = Math.abs(value - target);
        if (dist < bestYDist) {
          bestYDist = dist;
          bestYGuide = target;
          yPercent = target - (value - rawYPercent);
        }
      }
    }

    return {
      xPercent,
      yPercent,
      guides: { v: bestXGuide !== null ? [bestXGuide] : [], h: bestYGuide !== null ? [bestYGuide] : [] },
    };
  };

  const updatePositionFromPointer = (boxId: string, clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rawXPercent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const rawYPercent = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    const snapped = snapPosition(boxId, rawXPercent, rawYPercent);
    setGuides(snapped.guides);
    onChangeBox(boxId, { xPercent: snapped.xPercent, yPercent: snapped.yPercent });
  };

  // Resizing keeps the box's center fixed and grows/shrinks it symmetrically — the handle is on
  // the right edge, so the new width is twice the distance from center to the pointer.
  const updateWidthFromPointer = (box: CaptionBox, clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pointerXPercent = ((clientX - rect.left) / rect.width) * 100;
    const widthPercent = Math.min(98, Math.max(8, 2 * Math.abs(pointerXPercent - box.xPercent)));
    onChangeBox(box.id, { widthPercent });
  };

  const selectedBox = edit.boxes.find((b) => b.id === selectedBoxId) ?? edit.boxes[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Pencil className="h-4 w-4" /> Position your caption
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Drag the top handle to move a box, the side handle to resize it, or click into the text
          to edit it directly. Click a box to select it and adjust its style below.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={containerRef} className="relative w-full select-none rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={edit.imageUrl} alt="Preview" className="block w-full h-auto pointer-events-none rounded-lg" draggable={false} />
          {edit.boxes.map((box) => (
            <CaptionBoxOverlay
              key={box.id}
              box={box}
              selected={box.id === selectedBoxId}
              containerWidth={containerWidth}
              onSelect={() => setSelectedBoxId(box.id)}
              onTextChange={(text) => onChangeBox(box.id, { text })}
              onDragMove={(clientX, clientY) => updatePositionFromPointer(box.id, clientX, clientY)}
              onDragEnd={() => setGuides({ v: [], h: [] })}
              onResizeMove={(clientX) => updateWidthFromPointer(box, clientX)}
              registerRef={(el) => {
                boxRefs.current[box.id] = el;
              }}
            />
          ))}
          {guides.v.map((x, i) => (
            <div
              key={`v-${i}`}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
              style={{ left: `${x}%` }}
            />
          ))}
          {guides.h.map((y, i) => (
            <div
              key={`h-${i}`}
              className="pointer-events-none absolute left-0 right-0 h-px bg-primary"
              style={{ top: `${y}%` }}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={onAddBox}>
            <Plus className="h-3.5 w-3.5" /> Add text box
          </Button>
          <EmojiPickerButton onPick={onAddEmojiBox} />
        </div>

        {selectedBox && (
          <div className="space-y-2 rounded-lg border p-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Selected box style</Label>
              {edit.boxes.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-destructive"
                  onClick={() => onRemoveBox(selectedBox.id)}
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Text align</Label>
                <AlignButtons value={selectedBox.align} onChange={(align) => onChangeBox(selectedBox.id, { align })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Font</Label>
                <Select value={selectedBox.fontFamily} onValueChange={(v) => onChangeBox(selectedBox.id, { fontFamily: v })}>
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
              <TextColorControls
                colorMode={selectedBox.colorMode}
                color={selectedBox.color}
                gradientStops={selectedBox.gradientStops}
                onColorModeChange={(v) => onChangeBox(selectedBox.id, { colorMode: v })}
                onColorChange={(v) => onChangeBox(selectedBox.id, { color: v })}
                onGradientStopsChange={(v) => onChangeBox(selectedBox.id, { gradientStops: v })}
              />
              <div className="space-y-1">
                <Label className="text-xs">Size ({selectedBox.sizePercent}%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  className="h-8"
                  value={selectedBox.sizePercent}
                  onChange={(e) => onChangeBox(selectedBox.id, { sizePercent: Number(e.target.value) || selectedBox.sizePercent })}
                />
              </div>
              <div className="flex items-end gap-3 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    checked={selectedBox.bold}
                    onCheckedChange={(v) => onChangeBox(selectedBox.id, { bold: v === true })}
                  />
                  <Label className="text-xs font-normal">Bold</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    checked={selectedBox.emboss}
                    onCheckedChange={(v) => onChangeBox(selectedBox.id, { emboss: v === true })}
                  />
                  <Label className="text-xs font-normal">3D</Label>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Outline ({selectedBox.strokeWidth})</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  className="h-8"
                  value={selectedBox.strokeWidth}
                  onChange={(e) => onChangeBox(selectedBox.id, { strokeWidth: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" className="flex-1 gap-2" onClick={onApply} disabled={applying}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {applying ? "Applying…" : "Apply caption"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={applying}>
            Cancel run
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkflowDesignerRunner({
  initialWorkflowId,
  lockToInitial = false,
  adminCatalog = false,
}: { initialWorkflowId?: string; lockToInitial?: boolean; adminCatalog?: boolean } = {}) {
  const [definitions, setDefinitions] = useState<WorkflowSummary[]>([]);
  const [loadedDefinition, setLoadedDefinition] = useState<WorkflowDefinition | null>(null);
  const [definitionError, setDefinitionError] = useState<number | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [activeId, setActiveId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [photo, setPhoto] = useState("");
  const [selections, setSelections] = useState<WorkflowSelections>({ choices: {}, texts: {}, customInstructions: "" });
  const [resolution, setResolution] = useState<"1K" | "2K">("1K");
  // Applies to every "video" step in the run — same one-global-setting pattern as image
  // `resolution` above (no per-step override in the schema).
  const [videoResolution, setVideoResolution] = useState<"720p" | "1080p">("720p");
  const [videoDuration, setVideoDuration] = useState<"5s" | "10s" | "15s">("5s");
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [llmOutputs, setLlmOutputs] = useState<Record<string, string>>({});
  const [lastImage, setLastImage] = useState<Image | null>(null);
  const [comparisonImage, setComparisonImage] = useState<Image | null>(null);
  const [running, setRunning] = useState(false);
  const [keySetupOpen, setKeySetupOpen] = useState(false);
  // stepId -> whether an `optional` step should run this time (default true — off means skip).
  const [stepEnabled, setStepEnabled] = useState<Record<string, boolean>>({});
  // Non-null while a `userEditable` text-overlay step has paused the run, waiting for the
  // caption box(es) to be dragged/resized/edited and applied.
  const [captionEdit, setCaptionEdit] = useState<CaptionEditState | null>(null);
  const { toast } = useToast();

  // Mutable run state that needs to survive the pause-for-caption-edit boundary: runFrom() reads
  // and writes these instead of local `let`s, since it can be re-entered (from applyCaptionEdit)
  // after the component has re-rendered several times.
  const pipelineImageRef = useRef<string | null>(null);
  const finalImageRef = useRef<Image | null>(null);
  const textsRef = useRef<Record<string, string>>({});

  const activeSummary = useMemo(() => definitions.find((d) => d.id === activeId) ?? null, [definitions, activeId]);
  const active = loadedDefinition?.id === activeId ? loadedDefinition : null;
  // Only the per-ID server response authorizes delivery. Browser flags never unlock content.
  const requiresUnlock = definitionError === 401 || definitionError === 403;
  useEffect(() => {
    const check = () => { setLoadedDefinition(null); setDefinitionError(null); setRefresh((n) => n + 1); };
    window.addEventListener(ACCOUNT_CHANGED_EVENT, check);
    window.addEventListener(WORKFLOWS_CHANGED_EVENT, check);
    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, check);
      window.removeEventListener(WORKFLOWS_CHANGED_EVENT, check);
    };
  }, []);

  // "Caption Maker"-style workflows pair an "Image Prompt" text group with an optional image-edit
  // step the user can turn off ("just caption my photo as-is") — special-cased by name rather
  // than a generic per-step linking field, since the interactive on-image caption editor already
  // covers every other style/position control a "Step options" panel used to hold.
  const imagePromptGroup = active?.optionGroups.find((g) => g.name.trim().toLowerCase() === "image prompt") ?? null;
  const imagePromptStep = imagePromptGroup ? active?.steps.find((s) => s.optional) ?? null : null;
  const otherOptionalSteps = active?.steps.filter((s) => s.optional && s.id !== imagePromptStep?.id) ?? [];

  useEffect(() => {
    const controller = new AbortController();
    setHydrated(false);
    setCatalogFailed(false);
    loadWorkflowSummaries(adminCatalog, controller.signal).then((saved) => {
      if (controller.signal.aborted) return;
      setDefinitions(saved);
      setActiveId((current) => initialWorkflowId ?? (saved.some((d) => d.id === current) ? current : saved[0]?.id ?? ""));
    }).catch(() => {
      if (!controller.signal.aborted) { setCatalogFailed(true); setDefinitions([]); }
    }).finally(() => { if (!controller.signal.aborted) setHydrated(true); });
    return () => controller.abort();
  }, [adminCatalog, initialWorkflowId, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadedDefinition(null);
    setDefinitionError(null);
    if (activeId && hydrated && !catalogFailed && activeSummary) {
      loadWorkflowDefinition(activeId, controller.signal).then((record) => {
        if (!controller.signal.aborted) setLoadedDefinition(record.definition);
      }).catch((error) => {
        if (!controller.signal.aborted) setDefinitionError(error instanceof WorkflowRequestError ? error.status : 503);
      });
    }
    return () => controller.abort();
  }, [activeId, hydrated, catalogFailed, activeSummary, refresh]);

  // Default each "choices" group to its first choice whenever the active workflow changes.
  // "text" groups start blank; "toggle" groups start off (no fallback-to-on).
  useEffect(() => {
    if (!active) return;
    const defaults: Record<string, string> = {};
    for (const group of active.optionGroups) {
      const inputType = group.inputType ?? "choices";
      if (inputType === "choices" && group.choices.length > 0) defaults[group.id] = group.choices[0].id;
    }
    setSelections((prev) => ({ choices: defaults, texts: {}, customInstructions: prev.customInstructions }));
    setStatuses({});
    setLlmOutputs({});
    setLastImage(null);
    setComparisonImage(null);
    setCaptionEdit(null);
    pipelineImageRef.current = null;
    finalImageRef.current = null;
    textsRef.current = {};

    const enabled: Record<string, boolean> = {};
    for (const step of active.steps) {
      if (step.optional) enabled[step.id] = true;
    }
    setStepEnabled(enabled);
  }, [active]);

  const handleUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const setStatus = (id: string, status: StepStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: status }));

  if (catalogFailed) return <p role="alert">Unable to load workflows. Please try again later.</p>;

  if (hydrated && definitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No published workflows are available yet.
      </p>
    );
  }

  // Arrived via a specific workflow's card (?run=<id>) but that id no longer exists (deleted, or
  // a stale/bad link) — say so plainly instead of silently falling back to whatever the first
  // workflow happens to be, which would run the wrong thing without the visitor noticing.
  if (lockToInitial && hydrated && initialWorkflowId && !definitions.some((d) => d.id === initialWorkflowId)) {
    return (
      <p className="text-sm text-muted-foreground">
        This workflow isn&rsquo;t available anymore.{" "}
        <a href="/dashboard" className="text-primary underline underline-offset-2">
          Back to Dashboard
        </a>
      </p>
    );
  }

  // In locked mode, the workflow's own name/description stands in for the "Workflow" picker —
  // switching workflows happens by going back to the Dashboard and picking a different card, not
  // via a dropdown, so a first-time visitor never lands on this page unsure which tool they're in.
  const workflowHeader = lockToInitial && activeSummary && (
    <div className="space-y-1">
      <h1 className="text-xl font-bold">{activeSummary.name || "Untitled workflow"}</h1>
      {activeSummary.description && <p className="text-sm text-muted-foreground">{activeSummary.description}</p>}
    </div>
  );

  const needsUpload = active
    ? active.steps.some((step) => step.type === "image-edit" || step.type === "text-overlay" || step.type === "video")
    : false;

  // Runs the chain starting at `startIndex` — 0 for a fresh Run click, or a later index when
  // resuming after a userEditable text-overlay step's interactive pause (see applyCaptionEdit).
  // pipelineImageRef/finalImageRef/textsRef carry state across that pause since local variables
  // wouldn't survive the function returning while waiting on the user.
  async function runFrom(startIndex: number) {
    if (!active || active.steps.length === 0) return;

    // Drafts and older catalog rows may have malformed tokens. Validate the enabled chain
    // before any paid call; disabled LLM dependencies must not reach the caption canvas raw.
    if (startIndex === 0 && !workflowDefinitionSchema.safeParse({
      ...active,
      published: true,
      steps: active.steps.filter(step => !step.optional || stepEnabled[step.id] !== false),
    }).success) {
      toast({
        title: "Workflow needs repair before running",
        description: "Check for extra braces, unknown template variables, invalid steps or disabled prerequisite steps. No generation was started.",
        variant: "destructive",
      });
      return;
    }

    const apiKey = readBrowserApiKey();
    if (!apiKey) {
      setKeySetupOpen(true);
      return;
    }

    if (startIndex === 0) {
      if (needsUpload && !photo) {
        toast({ title: "Photo required", description: "Upload the starting image first", variant: "destructive" });
        return;
      }
      setLlmOutputs({});
      setLastImage(null);
      setComparisonImage(null);
      pipelineImageRef.current = null;
      finalImageRef.current = null;
      textsRef.current = {};
      const initialStatuses: Record<string, StepStatus> = {};
      for (const step of active.steps) initialStatuses[step.id] = { state: "pending" };
      setStatuses(initialStatuses);
    }

    setRunning(true);
    const modelDefault = localStorage.getItem(VENICE_MODEL_STORAGE_KEY) ?? DEFAULT_VENICE_MODEL;

    for (let i = startIndex; i < active.steps.length; i++) {
      const step = active.steps[i];

      if (step.optional && stepEnabled[step.id] === false) {
        setStatus(step.id, { state: "skipped" });
        continue;
      }

      setStatus(step.id, { state: "processing" });
      const rendered = renderTemplate(step.promptTemplate, step, active, selections, textsRef.current);

      if (step.type === "llm") {
        const renderedSystemPrompt = renderTemplate(step.systemPrompt ?? "", step, active, selections, textsRef.current);

        // Vision steps show the model the image they're about to write about. Resolution reuses
        // the same sourceImage rule edit steps follow, so "pipeline" here means the previous
        // step's result (falling back to the upload) with no separate concept to learn.
        let visionImages: string[] | undefined;
        if (step.seesImage) {
          const source = resolveStepImages(step, active, selections, photo, pipelineImageRef.current);
          const base = source.images[0];
          if (!base) {
            const message = "This step reads an image, but none was uploaded or produced yet.";
            setStatus(step.id, { state: "failed", error: message });
            toast({ title: `Step failed: ${step.label}`, description: message, variant: "destructive" });
            setRunning(false);
            return;
          }
          try {
            visionImages = [await downscaleForVision(base)];
          } catch {
            // A decode/canvas failure shouldn't kill the run — fall back to writing from the
            // prompt alone, which is exactly the pre-vision behaviour.
            visionImages = undefined;
            toast({ title: `${step.label}: couldn't read the image`, description: "Writing from the prompt only." });
          }
        }

        const response = await callVenice(
          renderedSystemPrompt.trim() || "You are a helpful assistant.",
          rendered,
          apiKey,
          step.modelId || modelDefault,
          visionImages
        );
        if (!response.success || !response.text) {
          setStatus(step.id, { state: "failed", error: response.error ?? "LLM returned no text" });
          toast({ title: `Step failed: ${step.label}`, description: response.error ?? "LLM returned no text", variant: "destructive" });
          setRunning(false);
          return;
        }
        textsRef.current = { ...textsRef.current, [llmVariableFor(step)]: response.text.trim() };
        setLlmOutputs({ ...textsRef.current });
        setStatus(step.id, { state: "completed" });
        continue;
      }

      if (step.type === "text-overlay") {
        const resolutionResult = resolveStepImages(step, active, selections, photo, pipelineImageRef.current);

        if (step.userEditable) {
          // Pause the run and hand control to the interactive drag/resize/edit view — it calls
          // applyCaptionEdit() to bake the final result and resume from i + 1.
          const { xPercent, yPercent } = anchorToPercent(step.textPosition ?? TEXT_OVERLAY_DEFAULTS.textPosition);
          setStatus(step.id, { state: "awaiting-input" });
          setCaptionEdit({
            stepId: step.id,
            imageUrl: resolutionResult.images[0],
            boxes: [
              {
                id: crypto.randomUUID(),
                text: sanitizeOverlayText(rendered),
                xPercent,
                yPercent,
                widthPercent: 80,
                align: step.textAlign ?? TEXT_OVERLAY_DEFAULTS.textAlign,
                color: step.textColor ?? TEXT_OVERLAY_DEFAULTS.textColor,
                colorMode: step.textColorMode ?? TEXT_OVERLAY_DEFAULTS.textColorMode,
                gradientStops: step.textGradientStops ?? TEXT_OVERLAY_DEFAULTS.textGradientStops,
                fontFamily: step.textFontFamily ?? TEXT_OVERLAY_DEFAULTS.textFontFamily,
                sizePercent: step.textSizePercent ?? TEXT_OVERLAY_DEFAULTS.textSizePercent,
                bold: step.textBold ?? TEXT_OVERLAY_DEFAULTS.textBold,
                strokeColor: step.textStrokeColor ?? TEXT_OVERLAY_DEFAULTS.textStrokeColor,
                strokeWidth: step.textStrokeWidth ?? TEXT_OVERLAY_DEFAULTS.textStrokeWidth,
                emboss: step.textEmboss ?? TEXT_OVERLAY_DEFAULTS.textEmboss,
              },
            ],
            resumeIndex: i + 1,
          });
          setRunning(false);
          return;
        }

        try {
          const { xPercent, yPercent } = anchorToPercent(step.textPosition ?? TEXT_OVERLAY_DEFAULTS.textPosition);
          const overlaidUrl = await drawTextBoxesOnImage(resolutionResult.images[0], [
            {
              text: sanitizeOverlayText(rendered),
              xPercent,
              yPercent,
              widthPercent: 90,
              align: step.textAlign ?? TEXT_OVERLAY_DEFAULTS.textAlign,
              color: step.textColor ?? TEXT_OVERLAY_DEFAULTS.textColor,
              colorMode: step.textColorMode ?? TEXT_OVERLAY_DEFAULTS.textColorMode,
              gradientStops: step.textGradientStops ?? TEXT_OVERLAY_DEFAULTS.textGradientStops,
              fontFamily: step.textFontFamily ?? TEXT_OVERLAY_DEFAULTS.textFontFamily,
              sizePercent: step.textSizePercent ?? TEXT_OVERLAY_DEFAULTS.textSizePercent,
              bold: step.textBold ?? TEXT_OVERLAY_DEFAULTS.textBold,
              strokeColor: step.textStrokeColor ?? TEXT_OVERLAY_DEFAULTS.textStrokeColor,
              strokeWidth: step.textStrokeWidth ?? TEXT_OVERLAY_DEFAULTS.textStrokeWidth,
              emboss: step.textEmboss ?? TEXT_OVERLAY_DEFAULTS.textEmboss,
            },
          ]);
          const image: Image = { url: overlaidUrl, width: 0, height: 0, content_type: "image/png" };
          pipelineImageRef.current = overlaidUrl;
          finalImageRef.current = image;
          setLastImage(image);
          setStatus(step.id, { state: "completed" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to draw text on the image";
          setStatus(step.id, { state: "failed", error: message });
          toast({ title: `Step failed: ${step.label}`, description: message, variant: "destructive" });
          setRunning(false);
          return;
        }
        continue;
      }

      if (step.type === "video") {
        const videoModel = modelById.get(step.modelId);
        if (!videoModel) {
          setStatus(step.id, { state: "failed", error: "Video model not registered" });
          setRunning(false);
          return;
        }
        const resolutionResult = resolveStepImages(step, active, selections, photo, pipelineImageRef.current);
        if (resolutionResult.missingReference) {
          toast({ title: "No attached reference image", description: `Falling back to pipeline/upload for step "${step.label}"` });
        }
        const response = await generateVenice(
          videoModel,
          {
            prompt: rendered,
            image_url: resolutionResult.images[0],
            resolution: videoResolution,
            duration: videoDuration,
          },
          apiKey
        );
        if (!response.success) {
          setStatus(step.id, { state: "failed", error: response.error });
          toast({ title: `Step failed: ${step.label}`, description: response.error, variant: "destructive" });
          setRunning(false);
          return;
        }
        pipelineImageRef.current = response.image.url;
        finalImageRef.current = response.image;
        setLastImage(response.image);
        setStatus(step.id, { state: "completed" });
        continue;
      }

      // image-edit
      const model = modelById.get(step.modelId);
      if (!model) {
        setStatus(step.id, { state: "failed", error: "Edit model not registered" });
        setRunning(false);
        return;
      }
      const resolutionResult = resolveStepImages(step, active, selections, photo, pipelineImageRef.current);
      if (resolutionResult.missingReference) {
        toast({ title: "No attached reference image", description: `Falling back to pipeline/upload for step "${step.label}"` });
      }
      const imageInput = modelAcceptsMultipleImages(model)
        ? { images: resolutionResult.images }
        : { image: resolutionResult.images[0] };
      const response = await generateVenice(
        model,
        {
          prompt: rendered,
          ...imageInput,
          aspect_ratio: "auto",
          resolution,
          output_format: "jpeg",
        },
        apiKey
      );
      if (!response.success) {
        setStatus(step.id, { state: "failed", error: response.error });
        toast({ title: `Step failed: ${step.label}`, description: response.error, variant: "destructive" });
        setRunning(false);
        return;
      }
      pipelineImageRef.current = response.image.url;
      finalImageRef.current = response.image;
      setLastImage(response.image);
      setStatus(step.id, { state: "completed" });
    }

    if (active.generateBeforeAfter && photo && finalImageRef.current) {
      try {
        const comparisonUrl = await createBeforeAfterImage(photo, finalImageRef.current.url);
        setComparisonImage({ url: comparisonUrl, width: 0, height: 0, content_type: "image/jpeg" });
      } catch (error) {
        console.error("Failed to build before/after comparison:", error);
        toast({
          title: "Before/after comparison failed",
          description: error instanceof Error ? error.message : "Couldn't splice the two images together",
          variant: "destructive",
        });
      }
    }

    setRunning(false);
    toast({ title: "Workflow complete" });
  }

  async function applyCaptionEdit() {
    if (!captionEdit) return;
    setRunning(true);
    try {
      const overlaidUrl = await drawTextBoxesOnImage(captionEdit.imageUrl, captionEdit.boxes);
      const image: Image = { url: overlaidUrl, width: 0, height: 0, content_type: "image/png" };
      pipelineImageRef.current = overlaidUrl;
      finalImageRef.current = image;
      setLastImage(image);
      setStatus(captionEdit.stepId, { state: "completed" });
      const resumeIndex = captionEdit.resumeIndex;
      setCaptionEdit(null);
      await runFrom(resumeIndex);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to draw text on the image";
      setStatus(captionEdit.stepId, { state: "failed", error: message });
      toast({ title: "Failed to apply caption", description: message, variant: "destructive" });
      setRunning(false);
    }
  }

  function cancelCaptionEdit() {
    if (captionEdit) setStatus(captionEdit.stepId, { state: "pending" });
    setCaptionEdit(null);
    setRunning(false);
  }

  function updateCaptionBox(boxId: string, patch: Partial<CaptionBox>) {
    setCaptionEdit((prev) =>
      prev ? { ...prev, boxes: prev.boxes.map((b) => (b.id === boxId ? { ...b, ...patch } : b)) } : prev
    );
  }

  function addCaptionBox() {
    setCaptionEdit((prev) => {
      if (!prev) return prev;
      const base = prev.boxes[0];
      const newBox: CaptionBox = {
        id: crypto.randomUUID(),
        text: "New text",
        xPercent: 50,
        yPercent: 50,
        widthPercent: 60,
        align: base?.align ?? TEXT_OVERLAY_DEFAULTS.textAlign,
        color: base?.color ?? TEXT_OVERLAY_DEFAULTS.textColor,
        colorMode: base?.colorMode ?? TEXT_OVERLAY_DEFAULTS.textColorMode,
        gradientStops: base?.gradientStops ?? TEXT_OVERLAY_DEFAULTS.textGradientStops,
        fontFamily: base?.fontFamily ?? TEXT_OVERLAY_DEFAULTS.textFontFamily,
        sizePercent: base?.sizePercent ?? TEXT_OVERLAY_DEFAULTS.textSizePercent,
        bold: base?.bold ?? TEXT_OVERLAY_DEFAULTS.textBold,
        strokeColor: base?.strokeColor ?? TEXT_OVERLAY_DEFAULTS.textStrokeColor,
        strokeWidth: base?.strokeWidth ?? TEXT_OVERLAY_DEFAULTS.textStrokeWidth,
        emboss: base?.emboss ?? TEXT_OVERLAY_DEFAULTS.textEmboss,
      };
      return { ...prev, boxes: [...prev.boxes, newBox] };
    });
  }

  // Emoji "stickers" are just text boxes whose content is a single glyph — same drag/resize
  // machinery, just seeded bigger (and narrower, since there's no wrapping to worry about) than
  // a caption box. Color/gradient/font are irrelevant to emoji glyphs (they render in their own
  // native color regardless), so the seeded values here are never expected to matter visually.
  function addEmojiBox(emoji: string) {
    setCaptionEdit((prev) => {
      if (!prev) return prev;
      const newBox: CaptionBox = {
        id: crypto.randomUUID(),
        text: emoji,
        xPercent: 50,
        yPercent: 30,
        widthPercent: 20,
        align: "center",
        color: TEXT_OVERLAY_DEFAULTS.textColor,
        colorMode: "solid",
        gradientStops: TEXT_OVERLAY_DEFAULTS.textGradientStops,
        fontFamily: TEXT_OVERLAY_DEFAULTS.textFontFamily,
        sizePercent: 15,
        bold: false,
        strokeColor: TEXT_OVERLAY_DEFAULTS.textStrokeColor,
        strokeWidth: 0,
        emboss: false,
      };
      return { ...prev, boxes: [...prev.boxes, newBox] };
    });
  }

  function removeCaptionBox(boxId: string) {
    setCaptionEdit((prev) => (prev ? { ...prev, boxes: prev.boxes.filter((b) => b.id !== boxId) } : prev));
  }

  const stepStatusFor = (id: string): StepStatus => statuses[id] ?? { state: "pending" };

  // Still shows the picker when not locked to one workflow (so a locked visitor can find a `free`
  // one to try instead) — everything past that (start image, options, run button, results) is
  // exactly what running this workflow would give away for free, so it's skipped entirely rather
  // than just disabled.
  if (requiresUnlock) {
    return (
      <div className="w-full max-w-md mx-auto space-y-4">
        {workflowHeader}
        {!lockToInitial && (
          <div className="space-y-1.5">
            <Label>Workflow</Label>
            <Select value={activeId} onValueChange={setActiveId}>
              <SelectTrigger><SelectValue placeholder="Pick a workflow" /></SelectTrigger>
              <SelectContent>
                {definitions.map((definition) => (
                  <SelectItem key={definition.id} value={definition.id}>
                    {definition.name || "Untitled"}
                    {definition.free ? " (free)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <LockCard
          title={`"${activeSummary?.name || "This workflow"}" requires current account access`}
          description={
            lockToInitial
              ? "$45 unlocks every guided workflow for 3 months — BYOK for generation costs."
              : "$45 unlocks every guided workflow for 3 months — BYOK for generation costs. Or pick a free one above."
          }
        />
      </div>
    );
  }

  if (definitionError) return <p role="alert">{definitionError === 404 ? "This workflow is not available." : "Unable to load this workflow. Please try again later."}</p>;
  if (!hydrated || !active) return <p role="status">Loading workflow…</p>;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      {workflowHeader}
      <p className="text-sm text-muted-foreground">
        {active.free ? 'Free workflow — no FetishUI membership required.' : 'Premium workflow — included with current account access.'}
        {' '}Venice charges separately for AI steps. Choose your inputs, run the workflow, then download or save your result to an album.
      </p>
      <VeniceKeySetup open={keySetupOpen} onOpenChange={setKeySetupOpen} disabled={running || captionEdit !== null} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{lockToInitial ? "Options" : "Run a workflow"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          {!lockToInitial && (
            <div className="space-y-1.5">
              <Label>Workflow</Label>
              <Select value={activeId} onValueChange={setActiveId}>
                <SelectTrigger><SelectValue placeholder="Pick a workflow" /></SelectTrigger>
                <SelectContent>
                  {definitions.map((definition) => (
                    <SelectItem key={definition.id} value={definition.id}>
                      {definition.name || "Untitled"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsUpload && (
            <div className="space-y-2">
              <Label htmlFor="workflow-start-image">Start image</Label>
              <Input
                id="workflow-start-image"
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={photo.startsWith("data:") ? "" : photo}
                className="h-8"
                onChange={(e) => setPhoto(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  className="h-8 w-auto flex-1 min-w-[10rem]"
                  onChange={(e) => {
                    handleUpload(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <AlbumImagePicker onPick={setPhoto} />
                {photo.startsWith("data:") && (
                  <span className="text-xs text-muted-foreground">Uploaded image attached</span>
                )}
                {photo && (
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setPhoto("")}>
                    Clear
                  </Button>
                )}
              </div>
              {photo && (
                <div className="border rounded-md overflow-hidden bg-muted/40 max-h-44 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Start image" className="max-h-44 w-auto object-contain" />
                </div>
              )}
            </div>
          )}

          {active && active.optionGroups.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{group.name || "Untitled group"}</Label>
                {group.id === imagePromptGroup?.id && imagePromptStep && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-normal text-muted-foreground">Edit image</Label>
                    <Switch
                      checked={stepEnabled[imagePromptStep.id] ?? true}
                      onCheckedChange={(checked) =>
                        setStepEnabled((prev) => ({ ...prev, [imagePromptStep.id]: checked }))
                      }
                    />
                  </div>
                )}
              </div>
              <OptionGroupInput
                group={group}
                selections={selections}
                onChoiceChange={(choiceId) =>
                  setSelections((prev) => ({
                    ...prev,
                    choices: { ...prev.choices, [group.id]: choiceId },
                  }))
                }
                onTextChange={(value) =>
                  setSelections((prev) => ({
                    ...prev,
                    texts: { ...prev.texts, [group.id]: value },
                  }))
                }
              />
            </div>
          ))}

          {otherOptionalSteps.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-sm">Step options</Label>
              {otherOptionalSteps.map((step) => (
                <div key={step.id} className="flex items-center justify-between">
                  <Label className="text-sm font-normal">{step.label || "Step"}</Label>
                  <Switch
                    checked={stepEnabled[step.id] ?? true}
                    onCheckedChange={(checked) => setStepEnabled((prev) => ({ ...prev, [step.id]: checked }))}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="workflow-extra-instructions">Extra instructions (optional)</Label>
            <Textarea
              id="workflow-extra-instructions"
              placeholder="Anything else to include via the {{custom}} token..."
              value={selections.customInstructions}
              onChange={(e) =>
                setSelections((prev) => ({ ...prev, customInstructions: e.target.value }))
              }
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Image quality</Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as "1K" | "2K")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1K">1K (cheaper)</SelectItem>
                <SelectItem value="2K">2K</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {active?.steps.some((step) => step.type === "video") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Video resolution</Label>
                <Select value={videoResolution} onValueChange={(v) => setVideoResolution(v as "720p" | "1080p")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Video length</Label>
                <Select value={videoDuration} onValueChange={(v) => setVideoDuration(v as "5s" | "10s" | "15s")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5s">5 seconds</SelectItem>
                    <SelectItem value="10s">10 seconds</SelectItem>
                    <SelectItem value="15s">15 seconds</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Button
            type="button"
            className="w-full gap-2"
            disabled={running || !active || !active.steps.length || captionEdit !== null}
            onClick={() => runFrom(0)}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {running ? "Running..." : "Run workflow"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Running again starts the workflow from the beginning and may incur new Venice charges. Failed runs are not retried automatically.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col space-y-4">
        {active && Object.keys(statuses).length > 0 && (
          <div className="space-y-2 p-4 border rounded-lg bg-muted/20">
            {active.steps.map((step, index) => {
              const status = stepStatusFor(step.id);
              return (
                <div key={step.id} className="flex items-start gap-2 text-sm">
                  {status.state === "completed" && <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />}
                  {status.state === "skipped" && <MinusCircle className="h-4 w-4 text-muted-foreground mt-0.5" />}
                  {status.state === "failed" && <XCircle className="h-4 w-4 text-red-500 mt-0.5" />}
                  {status.state === "awaiting-input" && <Pencil className="h-4 w-4 text-primary mt-0.5" />}
                  {status.state === "processing" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin mt-0.5" />}
                  {status.state === "pending" && <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />}
                  <div>
                    <span className={cn(status.state === "failed" && "text-red-500", status.state === "skipped" && "text-muted-foreground")}>
                      Step {index + 1}: {step.label}
                      {step.type === "text-overlay" && status.state !== "skipped" && status.state !== "awaiting-input" && " (no AI — drawn with code)"}
                      {status.state === "skipped" && " (skipped)"}
                      {status.state === "awaiting-input" && " (waiting for you to position the caption)"}
                      {status.error ? ` — ${status.error}` : ""}
                    </span>
                    {step.type === "llm" && llmOutputs[llmVariableFor(step)] && (
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {llmOutputs[llmVariableFor(step)]}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {captionEdit && (
          <CaptionDragEditor
            edit={captionEdit}
            onChangeBox={updateCaptionBox}
            onAddBox={addCaptionBox}
            onAddEmojiBox={addEmojiBox}
            onRemoveBox={removeCaptionBox}
            onApply={applyCaptionEdit}
            onCancel={cancelCaptionEdit}
            applying={running}
          />
        )}

        {comparisonImage && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Before / After</CardTitle>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={comparisonImage.url} download="workflow-before-after.jpg">
                  <Download className="h-4 w-4" /> Image
                </a>
              </Button>
            </CardHeader>
            <CardContent>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={comparisonImage.url} alt="Before and after comparison" className="w-full rounded-md" />
            </CardContent>
          </Card>
        )}

        {lastImage && (() => {
          const isVideo = lastImage.content_type?.startsWith("video/");
          return (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">Result</CardTitle>
                <div className="flex items-center gap-1.5">
                  <SaveToAlbumButton
                    imageUrl={lastImage.url}
                    modelName={active?.name}
                    variant="full"
                    className="h-8"
                  />
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={lastImage.url} download={isVideo ? "workflow-result.mp4" : "workflow-result.jpg"}>
                      <Download className="h-4 w-4" /> {isVideo ? "Video" : "Image"}
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isVideo ? (
                  <video src={lastImage.url} controls className="w-full rounded-md" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lastImage.url} alt="Workflow result" className="w-full rounded-md" />
                )}
              </CardContent>
            </Card>
          );
        })()}

        {Object.keys(statuses).length === 0 && !lastImage && !comparisonImage && !captionEdit && (
          <div className="flex-1 border rounded-lg bg-muted/20 flex items-center justify-center min-h-64">
            <p className="text-muted-foreground text-sm text-center px-6">
              Pick a workflow, set its options, and hit Run — chained results appear here.
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
