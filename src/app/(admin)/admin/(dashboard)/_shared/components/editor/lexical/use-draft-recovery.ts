"use client";

/**
 * 下書き復元フック
 *
 * @description AutoSavePlugin が LocalStorage に保存した下書き (`getDraftJson`) を
 * 読み取り、初期コンテンツと異なり・かつ Composer がマウント可能な EditorState JSON
 * で、かつ有効期限内の場合のみバナー表示状態を提供する。
 *
 * `useState` の lazy initializer で直接 `getDraftJson` を呼ぶと、`localStorage` が
 * 使えない Next.js の SSR 時は必ず `null` を返す一方、client hydration 時の初回
 * レンダーは実際の LocalStorage を読んで異なる結果を返しうるため、SSR markup と
 * hydration 直後の markup が食い違う（hydration mismatch）。`useEffect` 内で
 * `setState` を呼ぶ代替も一見成立するが、このリポジトリの ESLint gate
 * （React Compiler 由来の `react-hooks/set-state-in-effect`）が「effect 内で
 * setState を同期呼び出しする」パターンを構造的に禁止しているため使えない。
 *
 * 代わりに `useSyncExternalStore` を使う。これは React 公式が「サーバーと
 * クライアントで値が異なりうる外部ストア（LocalStorage 等）」向けに用意した
 * hook そのもので、`getServerSnapshot`（SSR/hydration 直後は常に `null`）と
 * `getSnapshot`（client の実値）を渡すだけで、mismatch を起こさず
 * hydration 後に自動で正しい値へ再レンダーしてくれる。
 * `getSnapshot` は同一 key に対して安定した参照を返す必要があるため
 * （でないと React が無限に再レンダーする）、モジュールスコープの
 * key→snapshot キャッシュ（`draftSnapshotCache`）を介す。
 *
 * 判定ロジックは `shouldOfferDraftRestore` として素の関数に切り出し、
 * bun test で純粋関数として単体テストできるようにしている。
 * 壊れた / 非互換 / 期限切れの下書きは黙って無視する（勝手に `clearDraft` しない）。
 */

import { useState, useSyncExternalStore } from "react";
import { getDraftJson } from "./plugins/AutoSavePlugin";
import { isLexicalComposerReadyEditorStateJson } from "@/shared/lib/validations/lexical";

export type LexicalDraft = { json: string; savedAt: string };

/**
 * 下書きの有効期限（ミリ秒）。`savedAt`（`getDraftJson` 由来の ms epoch 文字列）から
 * これを超えて経過した下書きは復元候補として提示しない（黙って無視するだけで、
 * 明示的な `clearDraft` は行わない）。
 *
 * create フォーム（`*-new` キー）は保存成功後もサーバー側 `redirect()` のため
 * クライアント側で確実に `clearDraft` できない構造上のギャップがあり、この
 * expiry が「DB 内容が変わった後も無関係な古い下書きが出続ける」問題を
 * 時間経過で自然に収束させる安全弁として働く。
 */
export const DRAFT_RECOVERY_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * 下書きを復元候補として提示すべきかを判定する純粋関数。
 *
 * - 下書きが存在しない → false
 * - 下書きが現在の初期コンテンツと同一 → false（差分なし）
 * - 下書きの保存日時が不正、または `DRAFT_RECOVERY_EXPIRY_MS` を超えて古い → false
 * - 下書き JSON が Composer にマウントできない形式 → false（壊れた/非互換な下書きは無視）
 */
export function shouldOfferDraftRestore(
  draft: LexicalDraft | null,
  initialContentJson: string,
  now: number = Date.now(),
): boolean {
  if (!draft) return false;
  if (draft.json === initialContentJson) return false;
  const savedAtMs = Number(draft.savedAt);
  if (!Number.isFinite(savedAtMs)) return false;
  if (now - savedAtMs > DRAFT_RECOVERY_EXPIRY_MS) return false;
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
 * `autoSaveKey` → 読み取り済み下書き の cache。`useSyncExternalStore` の
 * `getSnapshot` は「ストアが変化していない限り毎回同じ参照を返す」契約が
 * あるため（さもないと無限レンダーになる）、LocalStorage を毎回読み直さず
 * key ごとに 1 回だけ読んで固定する。ページ内でこのキーに対する下書きが
 * 外部から更新されることは無い（このフックは「起動時に見つかった下書き」を
 * 一度だけ提示する設計）ため、cache を無効化する仕組みは不要。
 */
const draftSnapshotCache = new Map<string, LexicalDraft | null>();

function readDraftSnapshot(autoSaveKey: string): LexicalDraft | null {
  if (!draftSnapshotCache.has(autoSaveKey)) {
    draftSnapshotCache.set(autoSaveKey, getDraftJson(autoSaveKey));
  }
  return draftSnapshotCache.get(autoSaveKey) ?? null;
}

/** SSR / hydration 直後は常に「下書きなし」相当を返す（バナー非表示で markup を揃える）。 */
function getServerDraftSnapshot(): null {
  return null;
}

/** 外部ストアの変化を購読しない（マウント時の 1 回読みのみで足りるため no-op）。 */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * 下書き復元フック
 *
 * `useSyncExternalStore` により、SSR 時と client hydration 直後の初回レンダーは
 * 常に `getServerDraftSnapshot`（= null、バナー非表示）で揃い、hydration mismatch
 * を起こさない。hydration 完了後に React が自動で `getSnapshot`（実際の
 * LocalStorage 値）へ再レンダーする。
 *
 * 以降のタイピングによる AutoSavePlugin の再保存はこのスナップショットに
 * 反映されない（意図通り: 「起動時に見つかった下書き」を提示する UI のため、
 * render 中に ref を読むパターンは使わない）。
 */
export function useDraftRecovery({
  autoSaveKey,
  initialContentJson,
  onRestore,
}: UseDraftRecoveryOptions): UseDraftRecoveryReturn {
  const draft = useSyncExternalStore(
    subscribeToNothing,
    () => readDraftSnapshot(autoSaveKey),
    getServerDraftSnapshot,
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
