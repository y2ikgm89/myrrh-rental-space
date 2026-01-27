/**
 * Analytics utilities
 *
 * @module shared/lib/analytics
 */

export { getAnalyticsConfig, type AnalyticsConfig } from './config'
export {
  getAnalyticsStats,
  isAnalyticsApiAvailable,
  type AnalyticsStats,
  type AnalyticsError,
} from './ga-data-api'
