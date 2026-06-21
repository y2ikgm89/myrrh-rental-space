/**
 * Per-Server-Action CDN tag purge coalescing via AsyncLocalStorage.
 *
 * Multiple queueTagPurge() calls inside one Server Action invocation accumulate
 * into a single Set; flushed once at the end of withPurgeBatch.
 *
 * Why AsyncLocalStorage (not React cache()):
 * cache() memoizes only within a single render tree. Server Actions don't share
 * that scope. AsyncLocalStorage is Next.js's documented per-request pattern.
 *
 * Nested withPurgeBatch calls short-circuit to share the parent batch — prevents
 * amplification when a Server Action calls another helper that also wraps.
 */

import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { purgeCloudflareCacheByTags } from "@/shared/lib/cloudflare";
import { firePurgeAsync } from "@/shared/lib/cache/fire-purge";
import type { CdnTagValue } from "@/shared/lib/constants/cdn-cache-tags";

interface Batch {
  tags: Set<string>;
}

const als = new AsyncLocalStorage<Batch>();

/**
 * Enqueue one or more CDN cache tags for batched purge.
 * - Inside withPurgeBatch: tags accumulate; flushed at scope end.
 * - Outside withPurgeBatch: fires immediately (unscoped).
 */
export function queueTagPurge(...tags: readonly CdnTagValue[]): void {
  if (tags.length === 0) return;

  const batch = als.getStore();
  if (!batch) {
    void firePurgeAsync(() => purgeCloudflareCacheByTags(tags.slice()), {
      operation: "queueTagPurge.unscoped",
      tags,
    });
    return;
  }
  for (const t of tags) batch.tags.add(t);
}

/**
 * Establish a purge-batching scope. All queueTagPurge calls inside fn() coalesce
 * into one Cloudflare API call after fn() resolves.
 *
 * Nested withPurgeBatch calls SHARE the parent batch (short-circuit) so a Server
 * Action calling another wrapped helper doesn't flush twice.
 */
export async function withPurgeBatch<T>(fn: () => Promise<T>): Promise<T> {
  // Nested guard: reuse parent batch
  if (als.getStore()) {
    return fn();
  }

  const batch: Batch = { tags: new Set() };
  try {
    return await als.run(batch, fn);
  } finally {
    if (batch.tags.size > 0) {
      const tags = [...batch.tags];
      void firePurgeAsync(() => purgeCloudflareCacheByTags(tags), {
        operation: "withPurgeBatch.flush",
        tags,
      });
    }
  }
}
