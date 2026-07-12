/**
 * CommentForm
 *
 * @description コメント入力フォームコンポーネント
 */

"use client";

import { useState, useTransition } from "react";
import { IconSend } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import { Textarea } from "@/admin/components/ui/textarea";

type CommentFormProps = {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function CommentForm({
  onSubmit,
  placeholder = "返信を入力...",
  disabled = false,
  autoFocus = false,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed || isPending) return;

    startTransition(async () => {
      await onSubmit(trimmed);
      setContent("");
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter で送信
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex gap-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isPending}
        autoFocus={autoFocus}
        rows={2}
        className="resize-none text-sm"
      />
      <Button
        type="button"
        size="icon"
        onClick={handleSubmit}
        disabled={!content.trim() || disabled || isPending}
        title="送信 (Ctrl+Enter)"
        aria-label="コメントを送信"
      >
        <IconSend className="h-4 w-4" />
      </Button>
    </div>
  );
}
