"use client";

/**
 * FAQ 項目の「役に立った / 役に立たなかった」投票
 *
 * Zendesk / HubSpot KB 方式: 集計値のみ、個人データは記録しない。
 * localStorage で投票済みフラグを永続化し、同じ項目への重複投票を防止する。
 */

import { useState, type ReactElement } from "react";
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
  const [voted, setVoted] = useState<VoteValue | null>(() => getStoredVote(id));
  const [helpful, setHelpful] = useState(helpfulCount);
  const [notHelpful, setNotHelpful] = useState(notHelpfulCount);

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
      <span className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
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
        <span role="status" className="text-[0.7rem] text-muted-foreground">
          ご回答ありがとうございました
        </span>
      )}
    </div>
  );
}
