"use client";

/**
 * メールアドレスのチップ（トークン）入力。
 *
 * - 入力 → Enter / カンマ / blur で確定し Badge チップ化、× で個別削除。
 * - 確定時に各アドレスを `z.email()` で検証（不正は inline エラーで弾く）。
 * - 貼り付けはカンマ/空白/セミコロン区切りで一括分割・正規化。
 * - IME 変換中の Enter 確定を抑止。空入力で Backspace は末尾チップを削除。
 * - 確定済みトークンは `join(",")` した hidden input（指定 name）に mirror し、
 *   既存の保存形式（カンマ区切り文字列）と互換のまま submit する。
 */
import { useId, useRef, useState } from "react";
import { z } from "zod";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/admin/components/ui";

const emailSchema = z.email();
const SPLIT_RE = /[,\s;]+/;

type EmailChipsProps = {
  /** mirror する hidden input の name（保存先フィールド） */
  name: string;
  /** 確定済みトークン（制御） */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** ラベル要素の id（aria-labelledby 用） */
  labelledBy?: string;
  /** 説明文要素の id（aria-describedby 用） */
  describedBy?: string;
};

export function EmailChips({
  name,
  value,
  onChange,
  disabled = false,
  placeholder,
  labelledBy,
  describedBy,
}: EmailChipsProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const composingRef = useRef(false);
  const errorId = useId();

  const includesEmail = (email: string): boolean =>
    value.some((v) => v.toLowerCase() === email.toLowerCase());

  /** draft / 貼り付け文字列を1つ以上のアドレスとして確定する。不正があれば false。 */
  const commit = (raw: string): boolean => {
    const parts = raw
      .split(SPLIT_RE)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      setError(null);
      return true;
    }
    const added: string[] = [];
    for (const part of parts) {
      if (!emailSchema.safeParse(part).success) {
        setError(`不正なメールアドレス: ${part}`);
        return false;
      }
      const dup =
        includesEmail(part) ||
        added.some((a) => a.toLowerCase() === part.toLowerCase());
      if (!dup) added.push(part);
    }
    if (added.length > 0) onChange([...value, ...added]);
    setError(null);
    return true;
  };

  const removeEmail = (email: string) => {
    onChange(value.filter((v) => v !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (commit(draft)) setDraft("");
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      const last = value[value.length - 1];
      if (last !== undefined) removeEmail(last);
    }
  };

  const describedByValue =
    [describedBy, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {value.map((email) => (
          <Badge key={email} variant="secondary" className="gap-1 pr-1">
            <span>{email}</span>
            <button
              type="button"
              aria-label={`${email} を削除`}
              onClick={() => removeEmail(email)}
              disabled={disabled}
              className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-sm leading-none hover:bg-foreground/10 disabled:cursor-not-allowed"
            >
              ×
            </button>
          </Badge>
        ))}
        <input
          type="text"
          inputMode="email"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (SPLIT_RE.test(text)) {
              e.preventDefault();
              if (commit(text)) setDraft("");
            }
          }}
          onBlur={() => {
            if (commit(draft)) setDraft("");
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : undefined}
          aria-invalid={error !== null}
          aria-labelledby={labelledBy}
          aria-describedby={describedByValue}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
      </div>
      <input type="hidden" name={name} value={value.join(",")} />
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
