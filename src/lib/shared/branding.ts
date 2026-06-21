import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import defaultLogo from "@/assets/logo.png";

export interface Branding {
  name: string;
  tagline: string;
  logo_url: string | null;
  mark: string;
}

const DEFAULT: Branding = {
  name: "BusAcTa Operations",
  tagline: "Offshore Tax Operations",
  logo_url: defaultLogo,
  mark: "B1",
};

export function useBranding() {
  const { data } = useQuery({
    queryKey: ["branding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", "branding")
        .maybeSingle();
      const merged = { ...DEFAULT, ...((data?.value as Partial<Branding>) ?? {}) } as Branding;
      if (!merged.logo_url) merged.logo_url = defaultLogo;
      return merged;
    },
    staleTime: 60_000,
  });
  return data ?? DEFAULT;
}
