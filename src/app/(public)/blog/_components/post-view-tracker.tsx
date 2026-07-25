"use client";

/**
 * ブログ記事の閲覧回数トラッカー
 *
 * 記事詳細ページ表示時に POST /api/blog/[id]/view を呼び、
 * viewCount を increment する。
 *
 * 重複防止:
 * - localStorage key `post:viewed:<id>` にセッション済みフラグを保存
 * - 24 時間経過後に再度 increment 可能（TTL で古いエントリを破棄）
 *
 * 個人情報は送信しない（Zendesk / HubSpot KB 方式）。
 */

import { useEffect, useRef } from "react";
import { MS_PER_DAY } from "@/shared/lib/date-format";

const STORAGE_KEY_PREFIX = "post:viewed:";
const TTL_MS = MS_PER_DAY; // 24 時間

function hasRecentlyViewed(id: string): boolean {
  try {
    const key = STORAGE_KEY_PREFIX + id;
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const timestamp = Number.parseInt(raw, 10);
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp < TTL_MS;
  } catch {
    return false;
  }
}

function markViewed(id: string): void {
  try {
    const key = STORAGE_KEY_PREFIX + id;
    window.localStorage.setItem(key, String(Date.now()));
  } catch {
    // localStorage 無効でも silent fail
  }
}

async function sendView(id: string): Promise<void> {
  try {
    await fetch(`/api/blog/${id}/view`, {
      method: "POST",
      keepalive: true, // ページ遷移中でも送信を保証
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // ネットワークエラーは無視（ベストエフォート）
  }
}

type PostViewTrackerProps = {
  readonly id: string;
};

/**
 * 記事詳細ページの初回表示時のみ view を increment する。
 * localStorage で 24 時間 dedup。
 */
export function PostViewTracker({ id }: PostViewTrackerProps) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    if (hasRecentlyViewed(id)) return;
    markViewed(id);
    void sendView(id);
  }, [id]);

  return null;
}
