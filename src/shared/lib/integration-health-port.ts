/**
 * lib → domain を跨がずに接続ヘルスへ通知するための port。
 * 実装の bind は domain の connection-health と instrumentation.register。
 */

import type { IntegrationKey } from "@/shared/lib/validations/enums/prisma-types";

export type ConnectionApiResult = {
  success: boolean;
  error?: unknown;
};

type Recorder = (
  key: IntegrationKey,
  result: ConnectionApiResult,
) => Promise<void>;

let recorder: Recorder | null = null;

export function bindConnectionHealthRecorder(next: Recorder): void {
  recorder = next;
}

export async function notifyConnectionApiResult(
  key: IntegrationKey,
  result: ConnectionApiResult,
): Promise<void> {
  await recorder?.(key, result);
}
