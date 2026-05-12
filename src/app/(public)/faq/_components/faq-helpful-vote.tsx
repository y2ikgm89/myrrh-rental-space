"use client";

/**
 * FAQ 項目の「役に立った / 役に立たなかった」投票
 *
 * Zendesk / HubSpot KB 方式: 集計値のみ、個人データは記録しない。
 * localStorage で投票済みフラグを永続化し、同じ項目への重複投票を防止する。
 *
 * React 19 公式推奨パターン: localStorage のような **変更通知を持たない外部ストア** は
 * `useSyncExternalStore` で読み取る（`.claude/rules/react-patterns.md` §useSyncExternalStore）。
 * `useState` lazy initializer で `window.localStorage` を読むと SSR と client 初回 render で
 * 値が食い違い hydration mismatch を起こす。
 */

import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

const STORAGE_KEY_PREFIX = "faq:voted:";

type VoteValue = "helpful" | "not-helpful";

function getStoredVote(id: string): VoteValue | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + id);
    if (raw === "helpful" || raw === "not-helpful") return raw;
    return null;
  } catch {
    return null;
  }
}

function storeVote(id: string, vote: VoteValue): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + id, vote);
  } catch {
    // silent fail
  }
}

async function sendVote(id: string, vote: VoteValue): Promise<void> {
  try {
    await fetch(`/api/faq/${id}/helpful`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote }),
    });
  } catch {
    // ネットワークエラーは無視（ベストエフォート）
  }
}

// localStorage は変更通知を持たないため subscribe は no-op
// react-patterns.md §useSyncExternalStore 準拠
const subscribe = () => () => {};

// SSR/ハイドレーション時のフォールバック値 — プリミティブ null は
// 呼び出しごとに同一参照（Object.is）のため getServerSnapshot の参照安定性を満たす
// react-patterns.md §getServerSnapshot の参照安定性 準拠
const getServerSnapshot = (): VoteValue | null => null;

type FaqHelpfulVoteProps = {
  readonly id: string;
  readonly helpfulCount: number;
  readonly notHelpfulCount: number;
};

export function FaqHelpfulVote({
  id,
  helpfulCount,
  notHelpfulCount,
}: FaqHelpfulVoteProps): ReactElement {
  // useRef でスナップショットをキャッシュ（getSnapshot は毎レンダーで呼ばれるため、
  // 参照安定性のために初回読み取り結果を保持する）
  // react-patterns.md §useSyncExternalStore 参照
  const snapshotRef = useRef<VoteValue | null>(null);
  const storedVote = useSyncExternalStore(
    subscribe,
    () => {
      snapshotRef.current ??= getStoredVote(id);
      return snapshotRef.current;
    },
    getServerSnapshot,
  );

  // 投票後のローカル state（楽観的更新）— storedVote を初期値として注入
  const [voted, setVoted] = useState<VoteValue | null>(storedVote);
  const [helpful, setHelpful] = useState(helpfulCount);
  const [notHelpful, setNotHelpful] = useState(notHelpfulCount);

  // hydration 後に localStorage から値が読めた場合、voted state に反映する
  // （ハイドレーション初回は getServerSnapshot が null を返すため）
  const [previousStoredVote, setPreviousStoredVote] = useState(storedVote);
  if (storedVote !== previousStoredVote) {
    setPreviousStoredVote(storedVote);
    if (voted === null && storedVote !== null) {
      setVoted(storedVote);
    }
  }

  const handleVote = (vote: VoteValue) => {
    if (voted) return;
    setVoted(vote);
    if (vote === "helpful") {
      setHelpful((c) => c + 1);
    } else {
      setNotHelpful((c) => c + 1);
    }
    storeVote(id, vote);
    void sendVote(id, vote);
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
        この回答は役に立ちましたか？
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={voted !== null}
          onClick={() => handleVote("helpful")}
          aria-pressed={voted === "helpful"}
          aria-label="役に立った"
          className={cn(
            "inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed",
            voted === "helpful" &&
              "border-accent bg-accent/5 text-accent disabled:opacity-100",
          )}
        >
          <IconThumbUp className="h-4 w-4" aria-hidden="true" />
          <span className="tabular-nums">{helpful}</span>
        </button>
        <button
          type="button"
          disabled={voted !== null}
          onClick={() => handleVote("not-helpful")}
          aria-pressed={voted === "not-helpful"}
          aria-label="役に立たなかった"
          className={cn(
            "inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed",
            voted === "not-helpful" &&
              "border-accent bg-accent/5 text-accent disabled:opacity-100",
          )}
        >
          <IconThumbDown className="h-4 w-4" aria-hidden="true" />
          <span className="tabular-nums">{notHelpful}</span>
        </button>
      </div>
      {voted && (
        <span role="status" className="text-xs text-muted-foreground">
          ご回答ありがとうございました
        </span>
      )}
    </div>
  );
}
