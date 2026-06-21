import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createContractProfileFn,
  deleteContractProfileFn,
  deleteContractTemplateFn,
  duplicateContractTemplateFn,
  getContractTemplateFn,
  getProfileMergeBundleFn,
  listCampaignOptionsFn,
  listContractDocumentsFn,
  listContractProfilesFn,
  listContractTemplatesFn,
  listLeadOptionsFn,
  recordContractDocumentFn,
  updateContractProfileFn,
  upsertContractTemplateFn,
} from "@/lib/contracts/functions";
import type {
  ContractDocument,
  ContractProfile,
  ContractTemplate,
  ListDocumentsInput,
  ListProfilesInput,
  ListTemplatesInput,
  ProfileMergeBundle,
} from "@/lib/contracts/schemas";

export const contractProfilesQuery = (args?: ListProfilesInput) =>
  queryOptions({
    queryKey: ["contract-profiles", "list", args ?? {}],
    queryFn: async (): Promise<ContractProfile[]> => {
      const { profiles } = await listContractProfilesFn({ data: args ?? {} });
      return profiles;
    },
    staleTime: 60 * 1000,
  });

export const contractTemplatesQuery = (args?: ListTemplatesInput) =>
  queryOptions({
    queryKey: ["contract-templates", "list", args ?? {}],
    queryFn: async (): Promise<ContractTemplate[]> => {
      const result = await listContractTemplatesFn({ data: args ?? {} });
      return (result as { templates: ContractTemplate[] }).templates;
    },
    staleTime: 60 * 1000,
  });

export const contractTemplateDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ["contract-templates", "detail", id] as const,
    queryFn: async (): Promise<ContractTemplate | null> => {
      const result = await getContractTemplateFn({ data: { id } });
      return (result as { template: ContractTemplate | null }).template;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

export const contractDocumentsQuery = (args?: ListDocumentsInput) =>
  queryOptions({
    queryKey: ["contract-documents", "list", args ?? {}],
    queryFn: async (): Promise<ContractDocument[]> => {
      const { documents } = await listContractDocumentsFn({ data: args ?? {} });
      return documents;
    },
    staleTime: 30 * 1000,
  });

export type LinkOption = { id: string; label: string };

export const leadOptionsQuery = () =>
  queryOptions({
    queryKey: ["contract-link-options", "leads"],
    queryFn: async (): Promise<LinkOption[]> => {
      const { options } = await listLeadOptionsFn();
      return options;
    },
    staleTime: 5 * 60 * 1000,
  });

export const campaignOptionsQuery = () =>
  queryOptions({
    queryKey: ["contract-link-options", "campaigns"],
    queryFn: async (): Promise<LinkOption[]> => {
      const { options } = await listCampaignOptionsFn();
      return options;
    },
    staleTime: 30 * 60 * 1000,
  });

// Hook wrappers — components call server fns through these (never import fns directly).
export function useContractFns() {
  return {
    createProfile: useServerFn(createContractProfileFn),
    updateProfile: useServerFn(updateContractProfileFn),
    deleteProfile: useServerFn(deleteContractProfileFn),
    getProfileMergeBundle: useServerFn(getProfileMergeBundleFn) as (args: {
      data: { id: string };
    }) => Promise<ProfileMergeBundle>,
    upsertTemplate: useServerFn(upsertContractTemplateFn),
    deleteTemplate: useServerFn(deleteContractTemplateFn),
    duplicateTemplate: useServerFn(duplicateContractTemplateFn),
    recordDocument: useServerFn(recordContractDocumentFn),
  };
}
