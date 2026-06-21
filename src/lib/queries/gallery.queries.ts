// Read-side queries for the File Gallery hub.
//
// Phase 3: Dual tree modes (Client-first / Project-first) + selectable
// container nodes (Firm / Client / Project) that show all files in scope.
//
// All reads go through the browser supabase client — RLS scopes every row.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Tree types
// ---------------------------------------------------------------------------

export type GalleryTreeTask = {
  id: string;
  title: string;
  slug: string | null;
  fileCount: number;
  /** All folder paths within this task (for the left-tree sub-tree). */
  folderPaths: string[];
  /** Folder colors keyed by path. */
  folderColors: Record<string, string | null>;
};

// --- Project-first (Option 2) ---
/** A project with tasks directly (no entity intermediate layer). */
export type GalleryProjectFlatNode = {
  id: string;
  name: string;
  slug: string | null;
  tasks: GalleryTreeTask[];
  residualCount: number;
};

// --- Client-first (Option 1) ---
/** A project sub-group within a client in client-first mode. */
export type GalleryClientProjectNode = {
  id: string; // project id
  name: string; // project name
  tasks: GalleryTreeTask[];
  residualCount: number;
};

/** A client with tasks sub-grouped by project. */
export type GalleryClientNode = {
  id: string; // clients.id
  name: string; // clients.name
  projects: GalleryClientProjectNode[];
};

// --- B2C Clients (unchanged) ---
export type GalleryTreeDirectClient = {
  id: string;
  name: string;
  tasks: GalleryTreeTask[];
};

export type GalleryTree = {
  firmId: string;
  firmName: string;
  /** For project-first view: projects with tasks directly (no entity layer). */
  projects: GalleryProjectFlatNode[];
  /** For client-first view: clients with tasks sub-grouped by project. */
  clientGroups: GalleryClientNode[];
  /** Tasks with a project_id but no client_id (edge case — shown as "Internal" in client-first). */
  unassignedTasks: GalleryTreeTask[];
  /** B2C clients (unchanged from Phase 2). */
  directClients: GalleryTreeDirectClient[];
};

// ---------------------------------------------------------------------------
// Node type — what the user has selected in the tree
// ---------------------------------------------------------------------------

export type GalleryNode =
  /** User is browsing inside a task's folder structure. */
  | { type: "task_folder"; taskId: string; folderPath: string; taskTitle: string }
  /** User clicked the Firm node → show all firm files. */
  | { type: "firm_folder"; firmId: string; firmName: string }
  /** User clicked a Client node → show all client files. */
  | { type: "client_folder"; clientId: string; clientName: string }
  /** User clicked a Project node → show all project files. */
  | { type: "project_folder"; projectId: string; projectName: string }
  /** Virtual residual folder for shared files at project level. */
  | { type: "project_residual"; id: string }
  /** Virtual residual folder for shared files at client level. */
  | { type: "client_residual"; id: string };

// ---------------------------------------------------------------------------
// Content types (what the right panel shows)
// ---------------------------------------------------------------------------

export type GalleryFolder = {
  path: string;
  name: string; // last path segment
  color: string | null;
  /**
   * When set, double-clicking this folder card navigates to this node
   * instead of treating `path` as a task sub-folder.
   * Used for project-as-folder cards (under firm) and task-as-folder cards (under project).
   */
  navigateTo?: GalleryNode;
};

export type GallerySourceTask = { id: string; title: string; slug: string | null };

export type GalleryFile = {
  id: string;
  task_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  is_shared: boolean;
  uploader_id: string | null;
  uploader_name: string | null;
  folder_path: string;
  /** Populated for residual/aggregate nodes so users can trace origin. */
  source_task: GallerySourceTask | null;
  /** Set for SharePoint-backed files — open this URL instead of fetching a signed URL. */
  sharepoint_web_url?: string | null;
};

export type GalleryNodeContent = {
  folders: GalleryFolder[];
  files: GalleryFile[];
};

// ---------------------------------------------------------------------------
// Internal row shapes
// ---------------------------------------------------------------------------

type FirmRow = { id: string; name: string };
type ClientRow = { id: string; name: string };
type ProjectRow = { id: string; name: string; slug: string | null };
type TaskRow = {
  id: string;
  title: string;
  slug: string | null;
  project_id: string | null;
  entity_id: string | null;
  client_id: string | null;
  direct_client_id: string | null;
};
type DirectClientRow = { id: string; display_name: string };
type CountRow = { task_id: string; is_shared: boolean };
type FolderRow = { task_id: string; path: string; color: string | null };

async function resolveUploaderNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  if (error) throw error;
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (p.full_name) map.set(p.id, p.full_name);
  }
  return map;
}

/** Returns direct child folder paths of parentPath (no deeper). */
function directChildPaths(allPaths: string[], parentPath: string): string[] {
  const prefix = parentPath ? parentPath + "/" : "";
  return allPaths.filter(
    (p) => p.startsWith(prefix) && p !== parentPath && p.slice(prefix.length).indexOf("/") === -1,
  );
}

// ---------------------------------------------------------------------------
// Tree query
// ---------------------------------------------------------------------------

export const galleryTreeQuery = () =>
  queryOptions({
    queryKey: ["gallery-tree"],
    staleTime: 60_000,
    queryFn: async (): Promise<GalleryTree> => {
      const [firmsRes, clientsRes, projectsRes, tasksRes, directRes, countsRes, foldersRes] =
        await Promise.all([
          supabase.from("firms").select("id, name").limit(1),
          supabase.from("clients").select("id, name").order("name"),
          supabase.from("projects").select("id, name, slug").order("name"),
          supabase
            .from("tasks")
            .select("id, title, slug, project_id, entity_id, client_id, direct_client_id")
            .order("title"),
          supabase.from("direct_clients").select("id, display_name").order("display_name"),
          supabase.from("task_attachments").select("task_id, is_shared").is("archived_at", null),
          supabase.from("task_document_folders").select("task_id, path, color"),
        ]);
      for (const res of [
        firmsRes,
        clientsRes,
        projectsRes,
        tasksRes,
        directRes,
        countsRes,
        foldersRes,
      ]) {
        if (res.error) throw res.error;
      }

      const firmRow = ((firmsRes.data ?? []) as FirmRow[])[0] ?? { id: "", name: "Firm" };
      const clients = (clientsRes.data ?? []) as ClientRow[];
      const projects = (projectsRes.data ?? []) as ProjectRow[];
      const tasks = (tasksRes.data ?? []) as TaskRow[];
      const directClients = (directRes.data ?? []) as DirectClientRow[];
      const counts = (countsRes.data ?? []) as CountRow[];
      const folderRows = (foldersRes.data ?? []) as FolderRow[];

      // task_id -> { total, shared }
      const fileCounts = new Map<string, { total: number; shared: number }>();
      for (const row of counts) {
        const c = fileCounts.get(row.task_id) ?? { total: 0, shared: 0 };
        c.total += 1;
        if (row.is_shared) c.shared += 1;
        fileCounts.set(row.task_id, c);
      }

      // task_id -> folder paths + colors
      const taskFolderPaths = new Map<string, string[]>();
      const taskFolderColors = new Map<string, Record<string, string | null>>();
      for (const f of folderRows) {
        const paths = taskFolderPaths.get(f.task_id) ?? [];
        paths.push(f.path);
        taskFolderPaths.set(f.task_id, paths);
        const colors = taskFolderColors.get(f.task_id) ?? {};
        colors[f.path] = f.color;
        taskFolderColors.set(f.task_id, colors);
      }

      const toTreeTask = (t: TaskRow): GalleryTreeTask => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        fileCount: fileCounts.get(t.id)?.total ?? 0,
        folderPaths: taskFolderPaths.get(t.id) ?? [],
        folderColors: taskFolderColors.get(t.id) ?? {},
      });

      // project_id -> residual count
      const projectResidual = new Map<string, number>();
      for (const t of tasks) {
        if (t.project_id) {
          const shared = fileCounts.get(t.id)?.shared ?? 0;
          projectResidual.set(t.project_id, (projectResidual.get(t.project_id) ?? 0) + shared);
        }
      }

      // ---- Project-first (Option 2): project → tasks directly ----
      const projectFlat: GalleryProjectFlatNode[] = projects
        .map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          tasks: tasks.filter((t) => t.project_id === p.id && !t.direct_client_id).map(toTreeTask),
          residualCount: projectResidual.get(p.id) ?? 0,
        }))
        .filter((p) => p.tasks.length > 0);

      // ---- Client-first (Option 1): client → project → tasks ----
      const clientGroups: GalleryClientNode[] = clients
        .map((c) => {
          const clientTasks = tasks.filter((t) => t.client_id === c.id);
          // sub-group by project
          const projMap = new Map<string, GalleryTreeTask[]>();
          for (const t of clientTasks) {
            if (!t.project_id) continue;
            const arr = projMap.get(t.project_id) ?? [];
            arr.push(toTreeTask(t));
            projMap.set(t.project_id, arr);
          }
          const clientProjects: GalleryClientProjectNode[] = [...projMap.entries()]
            .map(([pid, pts]) => {
              const proj = projects.find((p) => p.id === pid);
              return {
                id: pid,
                name: proj?.name ?? "Unknown Project",
                tasks: pts,
                residualCount: projectResidual.get(pid) ?? 0,
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
          return { id: c.id, name: c.name, projects: clientProjects };
        })
        .filter((c) => c.projects.length > 0);

      // ---- Unassigned tasks (project_id set, but no client_id) ----
      const unassignedTasks = tasks
        .filter((t) => t.project_id && !t.client_id && !t.direct_client_id)
        .map(toTreeTask);

      // ---- B2C clients (unchanged) ----
      const directTree: GalleryTreeDirectClient[] = directClients
        .map((d) => ({
          id: d.id,
          name: d.display_name,
          tasks: tasks.filter((t) => t.direct_client_id === d.id).map(toTreeTask),
        }))
        .filter((d) => d.tasks.length > 0);

      return {
        firmId: firmRow.id,
        firmName: firmRow.name,
        projects: projectFlat,
        clientGroups,
        unassignedTasks,
        directClients: directTree,
      };
    },
  });

// ---------------------------------------------------------------------------
// Node content query
// ---------------------------------------------------------------------------

const FILE_SELECT =
  "id, task_id, folder_path, filename, mime_type, size_bytes, created_at, is_shared, uploader_id";
const FILE_SELECT_WITH_TASK = `${FILE_SELECT}, tasks!inner(id, title, slug, project_id, client_id)`;

type RawFileRow = Omit<GalleryFile, "uploader_name" | "source_task"> & {
  tasks?: GallerySourceTask | GallerySourceTask[] | null;
};

function buildQueryKey(node: GalleryNode | null): unknown[] {
  if (!node) return ["gallery-node-files", null];
  switch (node.type) {
    case "task_folder":
      return ["gallery-node-files", "task_folder", node.taskId, node.folderPath];
    case "firm_folder":
      return ["gallery-node-files", "firm_folder", node.firmId];
    case "client_folder":
      return ["gallery-node-files", "client_folder", node.clientId];
    case "project_folder":
      return ["gallery-node-files", "project_folder", node.projectId];
    default:
      return ["gallery-node-files", node.type, (node as { id: string }).id];
  }
}

async function fetchAggregateFiles(
  column: "project_id" | "client_id",
  id: string,
): Promise<GalleryFile[]> {
  const { data, error } = await supabase
    .from("task_attachments")
    .select(FILE_SELECT_WITH_TASK)
    .is("archived_at", null)
    .eq(`tasks.${column}`, id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawFileRow[];
  const uploaderNames = await resolveUploaderNames(rows.map((r) => r.uploader_id));
  return rows.map((r) => {
    const src = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks;
    return {
      id: r.id,
      task_id: r.task_id,
      filename: r.filename,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      created_at: r.created_at,
      is_shared: r.is_shared,
      uploader_id: r.uploader_id,
      uploader_name: r.uploader_id ? (uploaderNames.get(r.uploader_id) ?? null) : null,
      folder_path: r.folder_path,
      source_task: src ?? null,
    };
  });
}

/**
 * Returns the content for the selected Gallery node.
 * - task_folder: files at folderPath + direct sub-folder list
 * - firm/client/project_folder: all files in scope (flat, with source_task)
 * - residual nodes: shared files with source_task
 */
export const galleryNodeFilesQuery = (node: GalleryNode | null) =>
  queryOptions({
    queryKey: buildQueryKey(node),
    enabled: !!node,
    staleTime: 30_000,
    queryFn: async (): Promise<GalleryNodeContent> => {
      if (!node) return { folders: [], files: [] };

      // ---- task_folder: navigate inside a task's folder tree ----
      if (node.type === "task_folder") {
        const [attachRes, spRes, fRes] = await Promise.all([
          supabase
            .from("task_attachments")
            .select(FILE_SELECT)
            .eq("task_id", node.taskId)
            .eq("folder_path", node.folderPath)
            .is("archived_at", null)
            .order("created_at", { ascending: false }),
          // SharePoint documents — only at the root task level (folderPath "")
          node.folderPath === ""
            ? (supabase as unknown as { from: (t: string) => any })
                .from("documents")
                .select(
                  "id, task_id, file_name, mime_type, file_size_bytes, sharepoint_web_url, uploaded_at, uploaded_by",
                )
                .eq("task_id", node.taskId)
                .is("deleted_at", null)
                .order("uploaded_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase.from("task_document_folders").select("path, color").eq("task_id", node.taskId),
        ]);
        if (attachRes.error) throw attachRes.error;
        if (fRes.error) throw fRes.error;

        const rawFiles = (attachRes.data ?? []) as RawFileRow[];
        const allFolderRows = (fRes.data ?? []) as Array<{ path: string; color: string | null }>;

        const childPaths = directChildPaths(
          allFolderRows.map((f) => f.path),
          node.folderPath,
        );
        const colorByPath = new Map(allFolderRows.map((f) => [f.path, f.color]));
        const folders: GalleryFolder[] = childPaths.map((p) => ({
          path: p,
          name: p.split("/").at(-1) ?? p,
          color: colorByPath.get(p) ?? null,
        }));

        const uploaderNames = await resolveUploaderNames(rawFiles.map((r) => r.uploader_id));
        const files: GalleryFile[] = rawFiles.map((r) => ({
          id: r.id,
          task_id: r.task_id,
          filename: r.filename,
          mime_type: r.mime_type,
          size_bytes: r.size_bytes,
          created_at: r.created_at,
          is_shared: r.is_shared,
          uploader_id: r.uploader_id,
          uploader_name: r.uploader_id ? (uploaderNames.get(r.uploader_id) ?? null) : null,
          folder_path: r.folder_path,
          source_task: null,
        }));

        type SpDocRow = {
          id: string;
          task_id: string;
          file_name: string;
          mime_type: string | null;
          file_size_bytes: number | null;
          sharepoint_web_url: string | null;
          uploaded_at: string;
          uploaded_by: string | null;
        };
        const spFiles: GalleryFile[] = ((spRes.data ?? []) as SpDocRow[]).map((d) => ({
          id: d.id,
          task_id: d.task_id,
          filename: d.file_name,
          mime_type: d.mime_type,
          size_bytes: d.file_size_bytes,
          created_at: d.uploaded_at,
          is_shared: false,
          uploader_id: d.uploaded_by,
          uploader_name: null,
          folder_path: "",
          source_task: null,
          sharepoint_web_url: d.sharepoint_web_url,
        }));

        return { folders, files: [...files, ...spFiles] };
      }

      // ---- firm_folder → show each project as a folder card ----
      if (node.type === "firm_folder") {
        const { data, error } = await supabase.from("projects").select("id, name").order("name");
        if (error) throw error;
        const folders: GalleryFolder[] = ((data ?? []) as Array<{ id: string; name: string }>).map(
          (p) => ({
            path: p.id, // use id as path key (not a real storage path)
            name: p.name,
            color: null,
            navigateTo: {
              type: "project_folder",
              projectId: p.id,
              projectName: p.name,
            } as GalleryNode,
          }),
        );
        return { folders, files: [] };
      }

      // ---- client_folder → show each project under the client as a folder card ----
      if (node.type === "client_folder") {
        // Find projects that have tasks linked to this client
        const { data: taskData, error: taskErr } = await supabase
          .from("tasks")
          .select("project_id, projects!inner(id, name)")
          .eq("client_id", node.clientId)
          .not("project_id", "is", null);
        if (taskErr) throw taskErr;
        // Deduplicate projects
        const seen = new Set<string>();
        const folders: GalleryFolder[] = [];
        for (const row of (taskData ?? []) as Array<{
          project_id: string | null;
          projects: { id: string; name: string } | Array<{ id: string; name: string }> | null;
        }>) {
          if (!row.project_id) continue;
          if (seen.has(row.project_id)) continue;
          seen.add(row.project_id);
          const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
          if (!proj) continue;
          folders.push({
            path: proj.id,
            name: proj.name,
            color: null,
            navigateTo: {
              type: "project_folder",
              projectId: proj.id,
              projectName: proj.name,
            } as GalleryNode,
          });
        }
        folders.sort((a, b) => a.name.localeCompare(b.name));
        return { folders, files: [] };
      }

      // ---- project_folder → show each task under the project as a folder card ----
      if (node.type === "project_folder") {
        const { data, error } = await supabase
          .from("tasks")
          .select("id, title, slug")
          .eq("project_id", node.projectId)
          .order("title");
        if (error) throw error;
        const folders: GalleryFolder[] = (
          (data ?? []) as Array<{ id: string; title: string; slug: string | null }>
        ).map((t) => ({
          path: t.id, // use id as path key
          name: t.title,
          color: null,
          navigateTo: {
            type: "task_folder",
            taskId: t.id,
            folderPath: "",
            taskTitle: t.title,
          } as GalleryNode,
        }));
        return { folders, files: [] };
      }

      // ---- Residual nodes ----
      const taskColumn = node.type === "project_residual" ? "project_id" : "client_id";
      const { data, error } = await supabase
        .from("task_attachments")
        .select(FILE_SELECT_WITH_TASK)
        .eq("is_shared", true)
        .is("archived_at", null)
        .eq(`tasks.${taskColumn}`, node.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as RawFileRow[];
      const uploaderNames = await resolveUploaderNames(rows.map((r) => r.uploader_id));
      const files: GalleryFile[] = rows.map((r) => {
        const src = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks;
        return {
          id: r.id,
          task_id: r.task_id,
          filename: r.filename,
          mime_type: r.mime_type,
          size_bytes: r.size_bytes,
          created_at: r.created_at,
          is_shared: r.is_shared,
          uploader_id: r.uploader_id,
          uploader_name: r.uploader_id ? (uploaderNames.get(r.uploader_id) ?? null) : null,
          folder_path: r.folder_path,
          source_task: src ?? null,
        };
      });
      return { folders: [], files };
    },
  });
