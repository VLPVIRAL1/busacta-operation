// Pre-defined folder structure templates for the Document Manager's
// "From Library" tab. Frontend-only data; deployed via createTaskFolder.

export type FolderTemplateNode = {
  name: string;
  children?: FolderTemplateNode[];
};

export type FolderTemplate = {
  id: string;
  label: string;
  description?: string;
  nodes: FolderTemplateNode[];
};

export const FOLDER_TEMPLATES: FolderTemplate[] = [
  {
    id: "1040-individual-tax",
    label: "1040 Individual Tax",
    description: "Standard layout for individual US tax engagements.",
    nodes: [
      { name: "1. PBC (Client Uploads)" },
      {
        name: "2. Tax Return",
        children: [{ name: "A. Drafts" }, { name: "B. E-Filed Copy" }],
      },
      {
        name: "3. Source Documents",
        children: [{ name: "W-2s" }, { name: "1099s" }, { name: "K-1s" }],
      },
    ],
  },
  {
    id: "monthly-bookkeeping",
    label: "Monthly Bookkeeping",
    description: "Recurring monthly close engagement structure.",
    nodes: [
      { name: "1. Bank Statements" },
      { name: "2. Payroll Reports" },
      {
        name: "3. Financial Statements",
        children: [{ name: "Q1" }, { name: "Q2" }, { name: "Q3" }, { name: "Q4" }],
      },
    ],
  },
  {
    id: "corporate-audit-setup",
    label: "Corporate Audit Setup",
    description: "Phased structure for corporate audit engagements.",
    nodes: [
      { name: "1. Planning & Risk Assessment" },
      { name: "2. Fieldwork" },
      { name: "3. Final Reports" },
    ],
  },
];

/**
 * Flatten a template into a depth-ordered list of {parent, name, depth}
 * entries relative to `basePath`. Parents always appear before children.
 */
export type FlattenedFolder = { parent: string; name: string; depth: number };

export function flattenTemplate(template: FolderTemplate, basePath: string): FlattenedFolder[] {
  const out: FlattenedFolder[] = [];
  const walk = (nodes: FolderTemplateNode[], parent: string, depth: number) => {
    for (const n of nodes) {
      out.push({ parent, name: n.name, depth });
      if (n.children?.length) {
        const nextParent = parent ? `${parent}/${n.name}` : n.name;
        walk(n.children, nextParent, depth + 1);
      }
    }
  };
  walk(template.nodes, basePath.replace(/^\/+|\/+$/g, ""), 0);
  return out;
}

export function countTemplateFolders(template: FolderTemplate): number {
  const count = (nodes: FolderTemplateNode[]): number =>
    nodes.reduce((acc, n) => acc + 1 + (n.children ? count(n.children) : 0), 0);
  return count(template.nodes);
}
