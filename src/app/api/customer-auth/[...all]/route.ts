/**
 * 顧客用 Better Auth API Route Handler
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */

import { customerAuth } from "@/shared/lib/customer-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(customerAuth);
