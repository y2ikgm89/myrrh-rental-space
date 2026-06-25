/**
 * 定数 - バレルエクスポート
 *
 * 使用方法:
 *   import { SITE_DEFAULTS, SESSION_CONFIG, getBaseUrl, CACHE_LIFE } from '@/shared/lib/constants'
 */

export { SITE_DEFAULTS } from "./defaults";
export { SESSION_CONFIG } from "./session";
export { PAGINATION_DEFAULTS } from "./pagination";
export { getBaseUrl, getAppUrl, getAdminUrl, getAppHost } from "./urls";
export { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "./cache";
export type { CacheLife, CacheTag } from "./cache";
export {
  ADMIN_SPACE_MANAGEMENT_TABS,
  type AdminSpaceManagementTab,
} from "./admin-space-management";
