// Supabase has been replaced by Cloudflare R2.
// This file is kept temporarily for backward compatibility and will be removed in a future cleanup.

// Supabase client — always null (storage migrated to R2)
export const supabase = null;

// Check if Supabase is configured — always false (storage migrated to R2)
export const isSupabaseConfigured = (): boolean => false;

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
