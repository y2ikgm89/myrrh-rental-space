"use client";

import type { ReactElement } from "react";

export interface ConsentTerm {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

interface TermsConsentChecklistProps {
  readonly terms: readonly ConsentTerm[];
  readonly agreedIds: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly disabled?: boolean;
  readonly heading?: string;
  /**
   * 装飾用のラッパ className 上書き。デフォルトは公開フォーム標準の border + p-4 枠。
   * `null` を渡すと枠を消して flat layout (login 等で外側に独自枠がある場合) になる。
   */
  readonly variant?: "boxed" | "flat";
}

/**
 * 公開 4 経路 (signup / reservation / inquiry / event-registration) の同意 UI を
 * 単一実装に統合する SSoT。各フォームでの拡散を解消する。
 *
 * 主要設計:
 * - `<label>` でチェックボックスとテキストを関連付け (44px hit area)
 * - リンクは `<label>` の外（テキスト内）に置き、外部リンク `target="_blank"` +
 *   `rel="noopener noreferrer"` + sr-only ヒントで WCAG 2.4.4 / 3.2.5 準拠
 * - aria-describedby チェーンで checkbox に「規約タイトル」を関連付け
 */
export function TermsConsentChecklist({
  terms,
  agreedIds,
  onToggle,
  disabled = false,
  heading,
  variant = "boxed",
}: TermsConsentChecklistProps): ReactElement | null {
  if (terms.length === 0) return null;

  const wrapper =
    variant === "boxed" ? "space-y-3 border border-border p-4" : "space-y-3";

  return (
    <div className={wrapper}>
      {heading && (
        <p className="text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {heading}
        </p>
      )}
      <ul role="list" className="space-y-2">
        {terms.map((term) => {
          const inputId = `consent-${term.id}`;
          const descId = `${inputId}-title`;
          const checked = agreedIds.includes(term.id);
          return (
            <li key={term.id}>
              <label
                htmlFor={inputId}
                className="flex min-h-11 items-start gap-3 py-1"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 border-border accent-accent"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(term.id)}
                  aria-describedby={descId}
                  aria-required="true"
                />
                <span id={descId} className="text-sm text-muted-foreground">
                  <a
                    href={`/terms/${term.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline transition-colors hover:text-foreground"
                  >
                    {term.title}
                    <span className="sr-only">（新しいタブで開きます）</span>
                  </a>
                  に同意します
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
