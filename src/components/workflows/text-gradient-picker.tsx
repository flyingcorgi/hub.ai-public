'use client';

// Shared solid/gradient color picker for text-overlay styling — used by both the designer's
// design-time defaults panel and the runner's interactive per-box style panel, so the two never
// drift out of sync.
import { GRADIENT_PRESETS, DEFAULT_GRADIENT_STOPS, TextColorMode } from "@/lib/workflows/designer-types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TextColorControlsProps {
  colorMode: TextColorMode;
  color: string;
  gradientStops: string[];
  onColorModeChange: (mode: TextColorMode) => void;
  onColorChange: (color: string) => void;
  onGradientStopsChange: (stops: string[]) => void;
  className?: string;
}

export function TextColorControls({
  colorMode,
  color,
  gradientStops,
  onColorModeChange,
  onColorChange,
  onGradientStopsChange,
  className,
}: TextColorControlsProps) {
  const stops = gradientStops.length >= 2 ? gradientStops : DEFAULT_GRADIENT_STOPS;
  const activePresetId = GRADIENT_PRESETS.find((p) => p.stops.join() === stops.join())?.id ?? "custom";

  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">Color</Label>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={colorMode === "solid" ? "default" : "outline"}
          className="h-8 flex-1"
          onClick={() => onColorModeChange("solid")}
        >
          Solid
        </Button>
        <Button
          type="button"
          size="sm"
          variant={colorMode === "gradient" ? "default" : "outline"}
          className="h-8 flex-1"
          onClick={() => onColorModeChange("gradient")}
        >
          Gradient
        </Button>
      </div>

      {colorMode === "solid" ? (
        <input
          type="color"
          className="h-8 w-full rounded-md border border-input bg-transparent"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
        />
      ) : (
        <div className="space-y-1">
          <div className="flex gap-1">
            {GRADIENT_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={activePresetId === preset.id ? "default" : "outline"}
                className="h-8 flex-1 px-1 text-xs"
                style={
                  activePresetId === preset.id
                    ? undefined
                    : { backgroundImage: `linear-gradient(90deg, ${preset.stops.join(", ")})`, color: "#fff", borderColor: "transparent" }
                }
                onClick={() => onGradientStopsChange(preset.stops)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={activePresetId === "custom" ? "default" : "outline"}
              className="h-8 flex-1 px-1 text-xs"
              onClick={() => onGradientStopsChange(stops)}
            >
              Custom
            </Button>
          </div>
          {activePresetId === "custom" && (
            <div className="flex gap-1">
              <input
                type="color"
                className="h-8 flex-1 rounded-md border border-input bg-transparent"
                value={stops[0]}
                onChange={(e) => onGradientStopsChange([e.target.value, stops[1]])}
              />
              <input
                type="color"
                className="h-8 flex-1 rounded-md border border-input bg-transparent"
                value={stops[1]}
                onChange={(e) => onGradientStopsChange([stops[0], e.target.value])}
              />
            </div>
          )}
          <div className="h-4 rounded-md" style={{ backgroundImage: `linear-gradient(90deg, ${stops.join(", ")})` }} />
        </div>
      )}
    </div>
  );
}
