import type { WebGLContextEntry } from "./types";

/**
 * WebGLコンテキスト上限を追跡するLRUマネージャー。
 * Phase 2-3 で Three.js / PixiJS コンテキスト管理に使用。
 *
 * React context ではなくクラスベースシングルトン。
 * ブラウザのWebGLコンテキスト上限（通常8-16）を超えないよう管理する。
 */
class WebGLContextManagerImpl {
  private readonly entries = new Map<string, WebGLContextEntry>();
  private readonly accessOrder: string[] = [];
  private maxContexts = 8;

  /** 最大コンテキスト数を設定 */
  setMaxContexts(max: number): void {
    this.maxContexts = max;
    this.evictIfNeeded();
  }

  /** 現在の登録数 */
  get count(): number {
    return this.entries.size;
  }

  /** 空きがあるか */
  get hasCapacity(): boolean {
    return this.entries.size < this.maxContexts;
  }

  /** コンテキストを登録。上限超過時はLRU eviction */
  register(entry: WebGLContextEntry): boolean {
    if (this.entries.has(entry.id)) {
      this.touch(entry.id);
      return true;
    }

    this.evictIfNeeded();

    if (!this.hasCapacity) {
      return false;
    }

    this.entries.set(entry.id, entry);
    this.accessOrder.push(entry.id);
    return true;
  }

  /** コンテキストを登録解除 */
  unregister(id: string): void {
    this.entries.delete(id);
    const idx = this.accessOrder.indexOf(id);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
  }

  /** アクセス順を更新（LRU） */
  touch(id: string): void {
    const idx = this.accessOrder.indexOf(id);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
      this.accessOrder.push(id);
    }
  }

  /** エントリを取得 */
  get(id: string): WebGLContextEntry | undefined {
    return this.entries.get(id);
  }

  /** 全コンテキストをクリア */
  clear(): void {
    this.entries.clear();
    this.accessOrder.length = 0;
  }

  private evictIfNeeded(): void {
    while (
      this.entries.size >= this.maxContexts &&
      this.accessOrder.length > 0
    ) {
      const lruId = this.accessOrder[0];
      if (lruId !== undefined) {
        this.accessOrder.shift();
        this.entries.delete(lruId);
      }
    }
  }
}

export const webGLContextManager = new WebGLContextManagerImpl();
