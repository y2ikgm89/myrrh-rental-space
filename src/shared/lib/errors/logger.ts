/**
 * GCP 構造化エラーロガー（Next.js Server 専用エントリ）
 *
 * @see https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
 * @see https://cloud.google.com/error-reporting/docs/formatting-error-messages
 */

import "server-only";

export { createErrorLogger, logError } from "./logger-core";
