import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { QaQuestionList } from "@/components/learning/qa-question-list";
import { useFirmId, learningQuestionsQuery } from "@/lib/queries/learning.queries";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/learning/qa")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[{ label: "Learning & Training", to: "/learning" }, { label: "Office Hours Q&A" }]}
      >
        <QaPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function QaPage() {
  const firmId = useFirmId();
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [resolvedFilter, setResolvedFilter] = useState<"all" | "open" | "resolved">("all");

  const resolved =
    resolvedFilter === "resolved" ? true : resolvedFilter === "open" ? false : undefined;

  const questionsQ = useQuery(
    learningQuestionsQuery(firmId, {
      courseId: courseFilter !== "all" ? courseFilter : null,
      resolved,
      search: search.trim() || undefined,
    }),
  );

  const coursesQ = useQuery({
    queryKey: ["training-courses-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_courses")
        .select("id, title")
        .order("title");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Office Hours Q&A"
        description="Ask technical questions and get answers from senior staff. Resolved questions form our Knowledge Bank."
      />
      <QaQuestionList
        questions={questionsQ.data ?? []}
        isLoading={questionsQ.isLoading}
        firmId={firmId}
        courses={coursesQ.data ?? []}
        search={search}
        onSearchChange={setSearch}
        courseFilter={courseFilter}
        onCourseFilterChange={setCourseFilter}
        resolvedFilter={resolvedFilter}
        onResolvedFilterChange={setResolvedFilter}
      />
    </div>
  );
}
