import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Download,
  Apple,
  AppWindow,
  Bell,
  Wifi,
  PanelsTopLeft,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { safeHref } from "@/lib/routing/safe-href";
import {
  WIN_DOWNLOAD_URL,
  MAC_DOWNLOAD_URL,
  detectOs,
  type DesktopOs,
} from "@/lib/desktop/download-urls";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download BusAcTa Operations Desktop — Windows & macOS" },
      {
        name: "description",
        content:
          "Download the BusAcTa Operations desktop app for Windows and macOS. Native window, system tray, notifications and offline indicator — same Lovable Cloud login as the web.",
      },
      {
        property: "og:title",
        content: "Download BusAcTa Operations Desktop",
      },
      {
        property: "og:description",
        content:
          "Native desktop client for BusAcTa Operations. Windows and macOS, same login as the web.",
      },
      { property: "og:url", content: "https://one.busacta.com/download" },
    ],
    links: [{ rel: "canonical", href: "https://one.busacta.com/download" }],
  }),
  component: DownloadPage,
  errorComponent: RouteErrorComponent,
});

function DownloadPage() {
  const [os, setOs] = useState<DesktopOs>("other");
  useEffect(() => setOs(detectOs()), []);

  const winHref = safeHref(WIN_DOWNLOAD_URL);
  const macHref = safeHref(MAC_DOWNLOAD_URL);

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/global-dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {/* Hero */}
        <section className="rounded-3xl border border-border bg-card/80 p-8 shadow-lg backdrop-blur sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Desktop app
          </p>
          <h1 className="mt-3 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            BusAcTa Operations for Desktop
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            A native window around the same Lovable Cloud workspace you use in the browser — with
            system tray, OS notifications, and an offline indicator. Sign in with the same account
            you already have.
          </p>

          {os !== "other" && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              We detected {os === "macos" ? "macOS" : "Windows"} — recommended download highlighted
              below.
            </p>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button
              asChild
              size="lg"
              variant={os === "windows" ? "default" : "outline"}
              className="h-auto justify-start py-4"
            >
              <a
                href={winHref ?? "#"}
                aria-disabled={!winHref}
                onClick={(e) => {
                  if (!winHref) e.preventDefault();
                }}
              >
                <AppWindow className="h-5 w-5" />
                <span className="flex flex-col items-start text-left">
                  <span className="text-sm font-semibold">Download for Windows</span>
                  <span className="text-xs opacity-80">.zip · 64-bit · latest</span>
                </span>
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant={os === "macos" ? "default" : "outline"}
              className="h-auto justify-start py-4"
            >
              <a
                href={macHref ?? "#"}
                aria-disabled={!macHref}
                onClick={(e) => {
                  if (!macHref) e.preventDefault();
                }}
              >
                <Apple className="h-5 w-5" />
                <span className="flex flex-col items-start text-left">
                  <span className="text-sm font-semibold">Download for macOS</span>
                  <span className="text-xs opacity-80">.zip · Intel/Apple Silicon · latest</span>
                </span>
              </a>
            </Button>
          </div>
        </section>

        {/* What you get */}
        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: PanelsTopLeft,
              title: "Native window + tray",
              body: "Dedicated desktop window with system tray icon — keep BusAcTa Operations out of your browser.",
            },
            {
              icon: Bell,
              title: "OS notifications",
              body: "Mentions, task assignments and timer alerts arrive as native notifications.",
            },
            {
              icon: Wifi,
              title: "Offline indicator",
              body: "Clear visual cue when the connection drops — auto-reconnects when you're back.",
            },
          ].map((f) => (
            <Card key={f.title} className="border-border bg-card/60">
              <CardHeader className="space-y-2 pb-3">
                <f.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{f.body}</CardContent>
            </Card>
          ))}
        </section>

        {/* Install steps */}
        <section className="mt-10">
          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle>Installation</CardTitle>
              <CardDescription>
                The desktop app ships as a ZIP archive — no installer required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={os === "macos" ? "macos" : "windows"}>
                <TabsList>
                  <TabsTrigger value="windows">
                    <AppWindow className="h-4 w-4" />
                    Windows
                  </TabsTrigger>
                  <TabsTrigger value="macos">
                    <Apple className="h-4 w-4" />
                    macOS
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="windows" className="mt-4">
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
                    <li>Download the Windows ZIP using the button above.</li>
                    <li>
                      In File Explorer, right-click the ZIP and choose <strong>Extract All…</strong>
                    </li>
                    <li>
                      Open the extracted{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        BusAcTaOne-win32-x64
                      </code>{" "}
                      folder.
                    </li>
                    <li>
                      Double-click{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">BusAcTaOne.exe</code>.
                    </li>
                    <li>
                      If Windows SmartScreen warns about an unrecognized publisher, click{" "}
                      <strong>More info</strong> → <strong>Run anyway</strong>. (The build is
                      unsigned — we'll add code-signing later.)
                    </li>
                    <li>
                      Optional: pin{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">BusAcTaOne.exe</code>{" "}
                      to your taskbar or Start menu for quick access.
                    </li>
                  </ol>
                </TabsContent>
                <TabsContent value="macos" className="mt-4">
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
                    <li>Download the macOS ZIP using the button above.</li>
                    <li>Double-click the ZIP in Finder — macOS will unzip it automatically.</li>
                    <li>
                      Drag{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">BusAcTaOne.app</code>{" "}
                      into your <strong>Applications</strong> folder.
                    </li>
                    <li>
                      First launch only: right-click (or Control-click){" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">BusAcTaOne.app</code>{" "}
                      and choose <strong>Open</strong>, then confirm in the Gatekeeper prompt.
                    </li>
                    <li>
                      After that you can launch it normally from Applications, Spotlight, or the
                      Dock.
                    </li>
                  </ol>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        {/* Sign in */}
        <section className="mt-10">
          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle>Signing in from the desktop client</CardTitle>
              <CardDescription>
                Same Lovable Cloud account, same MFA, same trusted devices.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-foreground">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Launch BusAcTa Operations — you'll land on the same login screen as the web.
                </li>
                <li>
                  <strong>Email + password</strong> works exactly as it does in the browser.
                </li>
                <li>
                  <strong>Google sign-in</strong> opens your system browser. After consent, the{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    busacta://auth-callback
                  </code>{" "}
                  deep link returns the session into the desktop window.
                </li>
                <li>
                  If you already passed <strong>MFA</strong> on this device on the web, the desktop
                  client honors the same trusted-device cookie — no second prompt.
                </li>
                <li>
                  Your session persists between launches. Sign out from the user menu (top-right)
                  when you're done.
                </li>
              </ol>
            </CardContent>
          </Card>
        </section>

        {/* Troubleshooting */}
        <section className="mt-10">
          <Card className="border-border bg-card/80">
            <CardHeader>
              <CardTitle>Troubleshooting</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="google">
                  <AccordionTrigger>
                    Google sign-in didn't return to the desktop app
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    Your browser must be allowed to open custom URL schemes. Complete the Google
                    flow, then if the desktop window doesn't pick up the session within a few
                    seconds, copy the URL from the browser's address bar (it starts with{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">busacta://</code>) and
                    paste it into your browser address bar to trigger the deep link manually. As a
                    fallback, use email + password.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="mac-damaged">
                  <AccordionTrigger>
                    macOS says the app is damaged or can't be opened
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    Right-click (Control-click){" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">BusAcTaOne.app</code> and
                    choose <strong>Open</strong> instead of double-clicking. Confirm in the
                    Gatekeeper dialog. You only need to do this once per machine.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="win-blocked">
                  <AccordionTrigger>Windows SmartScreen blocked BusAcTaOne.exe</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    Click <strong>More info</strong> in the SmartScreen dialog, then{" "}
                    <strong>Run anyway</strong>. The build is currently unsigned; signed installers
                    are on the roadmap.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="update">
                  <AccordionTrigger>How do I update?</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    Auto-update isn't enabled yet. Re-download the ZIP from this page and replace
                    the existing app folder. Your session and preferences persist between versions.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </section>

        <p className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          Files served from Lovable Cloud storage · same account everywhere
        </p>
      </div>
    </main>
  );
}
