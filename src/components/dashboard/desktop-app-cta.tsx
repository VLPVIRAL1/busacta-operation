import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Monitor, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isElectronShell } from "@/lib/desktop/download-urls";

const DISMISS_KEY = "dismiss-desktop-cta";

export function DesktopAppCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isElectronShell()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-gradient-to-r from-primary/10 via-card to-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Monitor className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Get BusAcTa Operations for desktop
          </p>
          <p className="text-xs text-muted-foreground">
            Native window, system tray, OS notifications, offline indicator — same login as the web.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <Button asChild size="sm">
          <Link to="/download">
            <Download className="h-4 w-4" />
            Download desktop app
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
