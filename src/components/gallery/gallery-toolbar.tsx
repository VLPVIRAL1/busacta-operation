// Type exports only — the toolbar UI has been absorbed into GalleryAddressBar.
// Keeping this file so existing imports of GalleryFilters / EMPTY_FILTERS don't break.
import type { FileTypeKey } from "./gallery-utils";

export type GalleryFilters = {
  search: string;
  type: FileTypeKey | "all";
};

export const EMPTY_FILTERS: GalleryFilters = { search: "", type: "all" };
