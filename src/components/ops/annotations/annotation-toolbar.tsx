import { MousePointer2, Pin, Square, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/shared/utils";
import type { AnnotationTool } from "./annotation-layer";

export function AnnotationToolbar({
  tool,
  onToolChange,
  showResolved,
  onShowResolvedChange,
  layerOn,
  onLayerOnChange,
  count,
}: {
  tool: AnnotationTool;
  onToolChange: (t: AnnotationTool) => void;
  showResolved: boolean;
  onShowResolvedChange: (v: boolean) => void;
  layerOn: boolean;
  onLayerOnChange: (v: boolean) => void;
  count: number;
}) {
  const ToolBtn = ({
    value,
    icon: Icon,
    label,
  }: {
    value: AnnotationTool;
    icon: typeof Pin;
    label: string;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 gap-1 px-2 text-xs",
        tool === value && layerOn && "bg-primary/15 text-primary",
      )}
      onClick={() => {
        onLayerOnChange(true);
        onToolChange(value);
      }}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background/80 px-2 py-1 text-xs backdrop-blur">
      <div className="flex items-center gap-0.5 border-r pr-2">
        <ToolBtn value="pointer" icon={MousePointer2} label="Pointer" />
        <ToolBtn value="pin" icon={Pin} label="Pin" />
        <ToolBtn value="rect" icon={Square} label="Highlight" />
      </div>
      <label className="flex items-center gap-1.5">
        <Switch checked={layerOn} onCheckedChange={onLayerOnChange} />
        <span className="text-muted-foreground">Layer</span>
      </label>
      <label className="flex items-center gap-1.5">
        <Switch checked={showResolved} onCheckedChange={onShowResolvedChange} />
        <span className="text-muted-foreground inline-flex items-center gap-1">
          {showResolved ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Resolved
        </span>
      </label>
      <span className="ml-auto text-muted-foreground">
        {count} note{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}
