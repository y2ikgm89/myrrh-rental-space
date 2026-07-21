"use client";

/**
 * 下書き復元フック
 *
 * @description AutoSavePlugin が LocalStorage に保存した下書き (`getDraftJson`) を
 * マウント時に 1 回だけ読み取り、初期コンテンツと異なり・かつ Composer が
 * マウント可能な EditorState JSON の場合のみバナー表示状態を提供する。
 *
 * 判定ロジックは `shouldOfferDraftRestore` として素の関数に切り出し、
 * bun test で純粋関数として単体テストできるようにしている。
 * 壊れた / 非互換な下書きは黙って無視する（勝手に `clearDraft` しない）。
 */

import { useState } from "react";
import { getDraftJson } from "./plugins/AutoSavePlugin";
import { isLexicalComposerReadyEditorStateJson } from "@/shared/lib/validations/lexical";

export type LexicalDraft = { json: string; savedAt: string };

/**
 * 下書きを復元候補として提示すべきかを判定する純粋関数。
 *
 * - 下書きが存在しない → false
 * - 下書きが現在の初期コンテンツと同一 → false（差分なし）
 * - 下書き JSON が Composer にマウントできない形式 → false（壊れた/非互換な下書きは無視）
 */
export function shouldOfferDraftRestore(
  draft: LexicalDraft | null,
  initialContentJson: string,
): boolean {
  if (!draft) return false;
  if (draft.json === initialContentJson) return false;
  return isLexicalComposerReadyEditorStateJson(draft.json);
}

export type UseDraftRecoveryOptions = {
  /** AutoSavePlugin の `autoSaveKey`（`lexical-draft:` prefix は Plugin 側が自動付与） */
  autoSaveKey: string;
  /** 現在の初期コンテンツ（DB から読み込んだ contentJson 等） */
  initialContentJson: string;
  /** 「下書きを復元」ボタン押下時のハンドラ（本文 setter への反映・editor リマウントは呼び出し側の責務） */
  onRestore: (json: string) => void;
};

export type UseDraftRecoveryReturn = {
  /** バナーを表示すべきか */
  isAvailable: boolean;
  /** 下書きの保存日時（ms epoch 文字列、`getDraftSavedAt` 由来） */
  savedAt: string | null;
  /** 「下書きを復元」ボタンのハンドラ */
  restore: () => void;
  /** 「無視する」ボタンのハンドラ（バナーを閉じるのみ、下書き自体は削除しない） */
  dismiss: () => void;
};

/**
 * 下書き復元フック
 *
 * マウント時（`useState` lazy initializer）に 1 回だけ LocalStorage を読む。
 * 以降のタイピングによる AutoSavePlugin の再保存はこのスナップショットに
 * 反映されない（意図通り: 「起動時に見つかった下書き」を提示する UI のため、
 * render 中に ref を読むパターンは使わない）。
 */
export function useDraftRecovery({
  autoSaveKey,
  initialContentJson,
  onRestore,
}: UseDraftRecoveryOptions): UseDraftRecoveryReturn {
  const [draft] = useState<LexicalDraft | null>(() =>
    getDraftJson(autoSaveKey),
  );
  const [dismissed, setDismissed] = useState(false);

  const isAvailable =
    !dismissed && shouldOfferDraftRestore(draft, initialContentJson);

  const restore = () => {
    if (!draft) return;
    onRestore(draft.json);
    setDismissed(true);
  };

  const dismiss = () => {
    setDismissed(true);
  };

  return {
    isAvailable,
    savedAt: draft?.savedAt ?? null,
    restore,
    dismiss,
  };
}
