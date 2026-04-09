/**
 * 管理者用 Better Auth API Route Handler
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */

import { adminAuth } from "@/shared/lib/admin-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(adminAuth);
