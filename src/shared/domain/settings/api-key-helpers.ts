import type {
  ConnectionStatus,
  CustomApiKeysMap,
  CustomApiKeyStored,
} from "@/shared/types/api-keys";
import { isRecord } from "@/shared/lib/serialize";

export function parseConnectionStatus(value: unknown): ConnectionStatus {
  if (value === "connected" || value === "error") {
    return value;
  }

  return null;
}

function isCustomApiKeyStored(value: unknown): value is CustomApiKeyStored {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["name"] === "string" &&
    typeof value["keyName"] === "string" &&
    typeof value["keyValue"] === "string" &&
    typeof value["createdAt"] === "string" &&
    typeof value["updatedAt"] === "string"
  );
}

export function parseCustomApiKeysMap(value: unknown): CustomApiKeysMap {
  if (!isRecord(value)) {
    return {};
  }

  const result: CustomApiKeysMap = {};

  for (const [key, entry] of Object.entries(value)) {
    if (isCustomApiKeyStored(entry)) {
      result[key] = entry;
    }
  }

  return result;
}
