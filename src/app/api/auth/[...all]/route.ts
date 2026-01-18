/**
 * Better Auth API Route Handler
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */

import { auth } from '@/shared/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
