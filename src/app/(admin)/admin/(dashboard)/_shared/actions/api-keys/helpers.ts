import { isRecord } from "@/shared/lib/serialize";
import type {
  CustomApiKeyStored,
  CustomApiKeysMap,
} from "@/admin/types/api-keys";

// =============================================================================
// Shared Type Guards and Helpers
// =============================================================================

export type ConnectionStatus = "connected" | "error";

export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return value === "connected" || value === "error";
}

export function parseConnectionStatus(value: unknown): ConnectionStatus | null {
  return isConnectionStatus(value) ? value : null;
}

/**
 * CustomApiKeyStoredの型ガード
 */
export function isCustomApiKeyStored(
  value: unknown,
): value is CustomApiKeyStored {
  if (!isRecord(value)) return false;
  return (
    typeof value["name"] === "string" &&
    typeof value["keyName"] === "string" &&
    typeof value["keyValue"] === "string" &&
    typeof value["createdAt"] === "string" &&
    typeof value["updatedAt"] === "string"
  );
}

/**
 * unknownからCustomApiKeysMapを安全にパースする
 */
export function parseCustomApiKeysMap(value: unknown): CustomApiKeysMap {
  if (!isRecord(value)) return {};

  const result: CustomApiKeysMap = {};

  for (const [key, entry] of Object.entries(value)) {
    if (isCustomApiKeyStored(entry)) {
      result[key] = entry;
    }
  }

  return result;
}
