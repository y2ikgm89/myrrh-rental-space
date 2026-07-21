/**
 * LexicalCorruptedContentNotice
 *
 * @description 未登録 node type を含む破損 EditorState JSON の復旧 UI。
 * 主防御（LexicalEditorDesktop / MobileEditorFallback の事前検証）と
 * 副防御（LexicalMountErrorBoundary）の両方から共通で使う。
 */

"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button, Textarea } from "@/admin/components/ui";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

type LexicalCorruptedContentNoticeProps = {
  /** 未登録の node type 一覧（Error Boundary 経由のベストエフォート取得時は空になりうる） */
  unregisteredTypes: string[];
  /** 開けない生の EditorState JSON（コピー用に表示するのみ、パースはしない） */
  contentJson: string;
  /** 指定時のみ「空の下書きにリセット」ボタンを表示する */
  onChange?: ((json: string) => void) | undefined;
};

export function LexicalCorruptedContentNotice({
  unregisteredTypes,
  contentJson,
  onChange,
}: LexicalCorruptedContentNoticeProps) {
  const confirm = useConfirm();

  const description =
    unregisteredTypes.length > 0
      ? `本文に未対応の要素（${unregisteredTypes.join("、")}）が含まれているため、エディタで開けません。`
      : "本文に未対応の要素が含まれているため、エディタで開けません。";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contentJson);
    toast.success("JSONをコピーしました");
  };

  const handleReset = async () => {
    if (!onChange) return;
    const confirmed = await confirm({
      title: "本文を空の下書きにリセットしますか？",
      description:
        "現在の本文は復元できません。リセット前に「生JSONを表示」からコピーして保存しておくことをお勧めします。",
      confirmLabel: "リセットする",
      variant: "destructive",
    });
    if (!confirmed) return;
    onChange(EMPTY_LEXICAL_EDITOR_STATE_JSON);
  };

  return (
    <div
      role="alert"
      className="flex gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground"
    >
      <IconAlertCircle
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="font-medium">本文を読み込めません</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            生JSONを表示
          </summary>
          <div className="mt-2 space-y-2">
            <Textarea
              readOnly
              value={contentJson}
              rows={8}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
            >
              JSONをコピー
            </Button>
          </div>
        </details>

        {onChange && (
          <div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleReset}
            >
              本文を空の下書きにリセットして編集を続ける
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
