import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/shared/lib/env/client";

// Supabase client (null if credentials not set)
export const supabase: SupabaseClient | null =
  clientEnv.NEXT_PUBLIC_SUPABASE_URL && clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        clientEnv.NEXT_PUBLIC_SUPABASE_URL,
        clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      )
    : null;

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => supabase !== null;

// Storage bucket names
export type StorageBucket = "spaces" | "posts" | "site" | "media";

export const STORAGE_BUCKETS: Record<
  "SPACES" | "POSTS" | "SITE" | "MEDIA",
  StorageBucket
> = {
  SPACES: "spaces",
  POSTS: "posts",
  SITE: "site",
  MEDIA: "media",
};
