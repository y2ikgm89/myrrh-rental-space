import type { ConnectionStatus } from "@/shared/types/api-keys";

export function parseConnectionStatus(value: unknown): ConnectionStatus {
  if (value === "connected" || value === "error") {
    return value;
  }

  return null;
}
