import { useState, type ReactNode } from "react";
import { Lightbulb } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

/**
 * Icon-only "Quick tip" trigger for Admin pages.
 * Renders a small lightbulb icon button; clicking it opens a dialog with the tip content.
 */
export function AdminGuide({
  pageName: _pageName,
  title = "Quick tip",
  children,
  className,
}: {
  pageName: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 shrink-0 rounded-full text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950 dark:hover:text-blue-300",
          className,
        )}
        onClick={() => setOpen(true)}
        title={title}
        aria-label={title}
      >
        <Lightbulb className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
