import type { ConnectionStatus } from "@/shared/types/api-keys";
import { ConnectionStatus as ConnectionStatusValue } from "@/shared/lib/validations/enums/prisma-types";

export function parseConnectionStatus(value: unknown): ConnectionStatus {
  if (
    value === ConnectionStatusValue.CONNECTED ||
    value === ConnectionStatusValue.ERROR
  ) {
    return value;
  }

  return null;
}
