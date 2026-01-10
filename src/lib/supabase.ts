import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Supabase client (null if credentials not set)
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => supabase !== null

// Storage bucket names
export const STORAGE_BUCKETS = {
  SPACES: 'spaces',
  BLOG: 'blog',
  SITE: 'site',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]
