import { queryOptions } from "@tanstack/react-query";
import {
  listCategorisationConfigs,
  listCategorisationRules,
  getCategorisationResults,
  getCategorisationStats,
  getGeminiUsageStats,
  getMLTrainingProgress,
  getTrainingSchedule,
} from "@/lib/ops/categorisation.functions";
import { getGeminiConfig } from "@/lib/gemini/gemini-config.functions";

export type GeminiUsagePeriod = "7d" | "30d" | "90d" | "all";

export const categorisationConfigsQuery = () =>
  queryOptions({
    queryKey: ["categorisation-configs"],
    queryFn: () => listCategorisationConfigs(),
    staleTime: 5 * 60 * 1000,
  });

export const categorisationRulesQuery = (docType: string) =>
  queryOptions({
    queryKey: ["categorisation-rules", docType],
    queryFn: () => listCategorisationRules({ data: { docType } }),
    staleTime: 5 * 60 * 1000,
    enabled: !!docType,
  });

export const categorisationResultsQuery = (attachmentId: string) =>
  queryOptions({
    queryKey: ["categorisation-results", attachmentId],
    queryFn: () => getCategorisationResults({ data: { attachmentId } }),
    staleTime: 60 * 1000,
    enabled: !!attachmentId,
  });

export const categorisationStatsQuery = () =>
  queryOptions({
    queryKey: ["categorisation-stats"],
    queryFn: () => getCategorisationStats(),
    staleTime: 60 * 1000,
  });

export const geminiUsageQuery = (period: GeminiUsagePeriod) =>
  queryOptions({
    queryKey: ["gemini-usage", period],
    queryFn: () => getGeminiUsageStats({ data: { period } }),
    staleTime: 2 * 60 * 1000,
  });

export const mlTrainingProgressQuery = () =>
  queryOptions({
    queryKey: ["ml-training-progress"],
    queryFn: () => getMLTrainingProgress(),
    staleTime: 60 * 1000,
  });

export const trainingScheduleQuery = () =>
  queryOptions({
    queryKey: ["categorisation-training-schedule"],
    queryFn: () => getTrainingSchedule(),
    staleTime: 30 * 1000,
  });

export const geminiConfigQuery = () =>
  queryOptions({
    queryKey: ["admin", "gemini", "config"],
    queryFn: () => getGeminiConfig(),
    staleTime: 60 * 1000,
  });
