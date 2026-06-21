import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadMicrosoftGraphConfig } from "@/lib/sharepoint/credentials.server";
import {
  getSiteDriveId,
  listTrainingFiles,
  getTrainingFileDownloadUrl,
} from "@/lib/sharepoint/training-files.server";

const ListFilesSchema = z.object({ folderPath: z.string().max(256).optional() });
const GetFileUrlSchema = z.object({ driveId: z.string(), itemId: z.string() });

export const listTrainingFilesServerFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListFilesSchema.parse(input))
  .handler(async ({ data }) => {
    const cfg = await loadMicrosoftGraphConfig();
    if (!cfg?.root_site_id) return [];
    const driveId = await getSiteDriveId(cfg.root_site_id);
    const folderPath: string = data?.folderPath || cfg.training_folder_path || "Training";
    return listTrainingFiles(driveId, folderPath);
  });

export const getTrainingFileUrlServerFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetFileUrlSchema.parse(input))
  .handler(async ({ data }) => {
    const url = await getTrainingFileDownloadUrl(data.driveId, data.itemId);
    return { url };
  });
