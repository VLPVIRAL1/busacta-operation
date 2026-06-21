import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const TZ_LABEL: Record<string, string> = {
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Phoenix": "MST",
  "America/Los_Angeles": "PT",
  "America/Anchorage": "AKT",
  "Pacific/Honolulu": "HT",
};

export function LiveUsClock({
  timezone,
  className,
}: {
  timezone: string | null | undefined;
  className?: string;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!timezone) {
    return (
      <span
        className={
          "inline-flex items-center gap-1.5 text-sm text-muted-foreground " + (className ?? "")
        }
      >
        <Clock className="h-3.5 w-3.5" />
        No client time zone set
      </span>
    );
  }

  let timeStr = "—";
  let dateStr = "";
  try {
    timeStr = now.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    dateStr = now.toLocaleDateString("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return (
      <span
        className={"inline-flex items-center gap-1.5 text-sm text-rose-600 " + (className ?? "")}
      >
        <Clock className="h-3.5 w-3.5" />
        Invalid time zone: {timezone}
      </span>
    );
  }
  const abbr = TZ_LABEL[timezone] ?? "";
  return (
    <span className={"inline-flex items-center gap-2 " + (className ?? "")}>
      <Clock className="h-4 w-4 text-primary" />
      <span className="font-mono tabular-nums text-base font-semibold">{timeStr}</span>
      <span className="text-xs text-muted-foreground">
        {abbr} · {dateStr}
      </span>
    </span>
  );
}
