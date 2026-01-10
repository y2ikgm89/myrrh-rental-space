import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials are not set. File upload functionality will be disabled.')
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
)

// Storage bucket names
export const STORAGE_BUCKETS = {
  SPACES: 'spaces',
  BLOG: 'blog',
  SITE: 'site',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]
