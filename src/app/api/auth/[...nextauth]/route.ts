/**
 * Auth.js API Route Handler
 *
 * /api/auth/* のすべてのリクエストを処理
 */

import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
