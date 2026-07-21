/**
 * Draft Recovery Banner
 *
 * @description LocalStorage に自動保存された未保存の下書きが見つかった場合に、
 * 復元を促すバナー。`useDraftRecovery` の state をそのまま受け取って表示する。
 */

"use client";

import { IconHistory } from "@tabler/icons-react";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
} from "@/admin/components/ui";
import { formatDateTimeFull } from "@/shared/lib/date-format";

export type DraftRecoveryBannerProps = {
  /** 下書きの保存日時（ms epoch 文字列、`getDraftJson` 由来） */
  savedAt: string | null;
  /** 「下書きを復元」ボタン押下時のハンドラ */
  onRestore: () => void;
  /** 「無視する」ボタン押下時のハンドラ */
  onDismiss: () => void;
};

export function DraftRecoveryBanner({
  savedAt,
  onRestore,
  onDismiss,
}: DraftRecoveryBannerProps) {
  const savedAtMs = savedAt != null ? Number(savedAt) : Number.NaN;
  const savedAtLabel = Number.isFinite(savedAtMs)
    ? formatDateTimeFull(new Date(savedAtMs))
    : null;

  return (
    <div className="shrink-0 px-4 py-3">
      <Alert variant="info">
        <IconHistory aria-hidden="true" />
        <AlertTitle>保存されていない下書きがあります</AlertTitle>
        <AlertDescription>
          <p>
            {savedAtLabel && `${savedAtLabel}時点で`}
            ブラウザに自動保存された下書きが見つかりました。復元しますか？
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={onRestore}>
              下書きを復元
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
              無視する
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
