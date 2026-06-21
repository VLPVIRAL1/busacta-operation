import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTemplateWithFieldsFn,
  getVersionHistoryFn,
  listTemplatesFn,
} from "@/lib/pdf-templates/functions";
import type { PdfDocType, PdfTemplate, PdfTemplateField } from "@/lib/pdf-templates/schemas";

export const pdfTemplatesQuery = (docType?: PdfDocType) =>
  queryOptions({
    queryKey: ["pdf-templates", "list", docType ?? "all"],
    queryFn: async () => {
      const { templates } = await listTemplatesFn({ data: { docType } });
      return templates;
    },
    staleTime: 2 * 60 * 1000,
  });

export const pdfTemplateDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ["pdf-templates", "detail", id] as const,
    queryFn: async (): Promise<{ template: PdfTemplate | null; fields: PdfTemplateField[] }> => {
      const result = await getTemplateWithFieldsFn({ data: { id } });
      return result as { template: PdfTemplate | null; fields: PdfTemplateField[] };
    },
    staleTime: 30 * 1000,
    enabled: !!id,
  });

export const pdfVersionHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: ["pdf-templates", "versions", id] as const,
    queryFn: async (): Promise<PdfTemplate[]> => {
      const result = await getVersionHistoryFn({ data: { id } });
      const { versions } = result as { versions: PdfTemplate[] };
      return versions;
    },
    staleTime: 60 * 1000,
    enabled: !!id,
  });

// Hook wrappers for use in components (avoids direct import of server functions in component files)
export function usePdfTemplateFns() {
  return {
    getTemplateWithFields: useServerFn(getTemplateWithFieldsFn),
    listTemplates: useServerFn(listTemplatesFn),
  };
}
