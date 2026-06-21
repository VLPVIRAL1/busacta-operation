import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export type ProfileSelf = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  avatar_url: string | null;
  position: string | null;
};

export const profileSelfQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["profile-self", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, specialty, avatar_url, position")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as ProfileSelf | null;
    },
  });

export async function updateProfileSelf(
  userId: string,
  patch: { full_name: string | null; phone: string | null; specialty: string | null },
) {
  const { error } = await supabase
    .from("profiles")
    .update(patch as never)
    .eq("id", userId);
  if (error) throw error;
}
