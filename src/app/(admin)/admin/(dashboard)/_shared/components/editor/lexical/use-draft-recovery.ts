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
 *
 * `getSnapshot` は同一 key に対して安定した参照を返す必要がある（でないと
 * React が無限に再レンダーする）。**PR#1350 の初版はこれを満たすために
 * モジュールスコープの key→snapshot キャッシュ（`Map`）を使っていたが、これは
 * 「一度読んだら二度と再読込しない」永続キャッシュになってしまっていた。**
 * SPA 内クライアント遷移（Next.js `<Link>` での画面遷移によるコンポーネントの
 * unmount/remount）を挟むと、実際の LocalStorage の最新状態（新しい下書きの
 * 保存・`clearDraft` による削除）が反映されず、下書き復元機能が実質的に
 * 壊れる致命的なバグだった（PR#1350 への chatgpt-codex-connector レビュー
 * 指摘 P1, thread `PRRT_kwDOQ0jEts6Sg6Pv`）。
 *
 * 修正: キャッシュを**マウントスコープ**に変更した（`createDraftSnapshotStore`
 * 参照）。同一マウント中は 1 回だけ LocalStorage を読んで参照を固定する
 * （従来通り `getSnapshot` の安定参照契約を満たし、かつ「起動時に見つかった
 * 下書きを一度だけ提示する」設計を維持する = タイピング中の AutoSave
 * 再保存では再読込しない）。一方マウントそのものは SPA 遷移のたびに
 * 作り直されるため、次のマウントでは必ず最新の LocalStorage を読み直す。
 * さらに `clearDraft(autoSaveKey)` が呼ばれた場合は `AutoSavePlugin` が
 * dispatch する `DRAFT_CLEARED_EVENT` を購読し、同一マウント中でも
 * キャッシュを明示的に無効化して再レンダーする（保存直後に、既に存在しない
 * 下書きをバナーが提示し続けるのを防ぐ）。
 *
 * キャッシュの保持には `useRef` ではなく `useState` の lazy initializer を
 * 使っている。（訂正: 当初このコメントは「`useSyncExternalStore` の
 * `getSnapshot` 内で `ref.current` を読むと ESLint `react-hooks/refs` が
 * error になるため `useRef` は使えない」としていたが、これは誤り。
 * `getSnapshot` クロージャ内での `ref.current ??= computeValue()` 形の
 * lazy キャッシュは実機 ESLint 検証済みで react-hooks/refs を一切トリガー
 * しない（faq-helpful-vote.tsx 等で同型パターンが disable コメント無しで
 * lint 済）。`useState` を選んでいるのは、このリポジトリのマウント時
 * スナップショット取得の統一慣習（`useState(initializer)`、
 * feedback_react-compiler-no-ref-read-during-render 参照）に合わせた
 * スタイル上の選択であり、`useRef` でも動作上・lint 上の問題は無い。
 *
 * 判定ロジックは `shouldOfferDraftRestore` として素の関数に切り出し、
 * bun test で純粋関数として単体テストできるようにしている。
 * 壊れた / 非互換 / 期限切れの下書きは黙って無視する（勝手に `clearDraft` しない）。
 */

import { useState, useSyncExternalStore } from "react";
import { getDraftJson, DRAFT_CLEARED_EVENT } from "./plugins/AutoSavePlugin";
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
 *
 * `now` はデフォルト引数にせず必須にしている。`now: number = Date.now()` の
 * ようにデフォルト引数へ隠すと、render 中に引数省略で呼び出しても
 * ESLint react-hooks/purity（React Compiler ルール）が検知できない
 * （呼び出し式の直接の引数として現れないため）。呼び出し側
 * （`useDraftRecovery`）で明示的に読み取らせることで、impure read が
 * 常に目に見える形で残る。
 */
export function shouldOfferDraftRestore(
  draft: LexicalDraft | null,
  initialContentJson: string,
  now: number,
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

/** SSR / hydration 直後は常に「下書きなし」相当を返す（バナー非表示で markup を揃える）。 */
function getServerDraftSnapshot(): null {
  return null;
}

/** `DRAFT_CLEARED_EVENT` の detail が文字列（= autoSaveKey）かを検証する type guard。 */
function readClearedDraftKey(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null;
  // `CustomEvent` は `T = any` がデフォルトのため `event.detail` は any 型になる。
  // 分割代入で一旦 any の変数へ束縛する（unsafe destructuring）代わりに、
  // プロパティアクセスを直接 typeof で narrow してから返す。
  return typeof event.detail === "string" ? event.detail : null;
}

type DraftSnapshotState = {
  read: boolean;
  value: LexicalDraft | null;
};

/**
 * `autoSaveKey` 1 つに対する `subscribe` / `getSnapshot` ペアを生成する。
 * 内部状態 `state` はこの関数のクロージャにのみ閉じる（module scope でも
 * `useRef` でもない）。呼び出し元の `useDraftRecovery` が `useState` の
 * lazy initializer で 1 回だけ生成することで、「1 mount = 1 回だけ
 * LocalStorage を読む」を実現する（上部の doc comment 参照）。
 */
function createDraftSnapshotStore(autoSaveKey: string): {
  getSnapshot: () => LexicalDraft | null;
  subscribe: (onStoreChange: () => void) => () => void;
} {
  const state: DraftSnapshotState = { read: false, value: null };

  function getSnapshot(): LexicalDraft | null {
    if (!state.read) {
      state.read = true;
      state.value = getDraftJson(autoSaveKey);
    }
    return state.value;
  }

  function subscribe(onStoreChange: () => void): () => void {
    const handleDraftCleared = (event: Event): void => {
      if (readClearedDraftKey(event) !== autoSaveKey) return;
      if (state.read && state.value === null) return; // 既に変化なし
      state.read = true;
      state.value = null;
      onStoreChange();
    };
    window.addEventListener(DRAFT_CLEARED_EVENT, handleDraftCleared);
    return () =>
      window.removeEventListener(DRAFT_CLEARED_EVENT, handleDraftCleared);
  }

  return { getSnapshot, subscribe };
}

/**
 * 下書き復元フック
 *
 * `useSyncExternalStore` により、SSR 時と client hydration 直後の初回レンダーは
 * 常に `getServerDraftSnapshot`（= null、バナー非表示）で揃い、hydration mismatch
 * を起こさない。hydration 完了後に React が自動で `getSnapshot`（実際の
 * LocalStorage 値）へ再レンダーする。
 *
 * ストアはマウントごとに `createDraftSnapshotStore` で新規生成する（詳細は
 * ファイル冒頭の doc comment）。以降のタイピングによる AutoSavePlugin の
 * 再保存はこのスナップショットに反映されない（意図通り: 「起動時に見つかった
 * 下書き」を提示する UI のため、render 中に ref を読むパターンは使わない）。
 * 一方で `clearDraft` による削除は `DRAFT_CLEARED_EVENT` 経由で同一マウント中
 * でも反映される。
 */
export function useDraftRecovery({
  autoSaveKey,
  initialContentJson,
  onRestore,
}: UseDraftRecoveryOptions): UseDraftRecoveryReturn {
  // useState lazy initializer: マウント時のみ 1 回生成（非制御コンポーネント設計と
  // 同じパターン、cf. LexicalEditorDesktopMounted の initialConfig）。呼び出し元
  // 4 箇所（post/terms/news/space の各 editor hook）はいずれも
  // `entity ? \`type-${entity.id}\` : "type-new"` のように編集対象の id 由来かつ、
  // 新規作成成功後は別ルートへ router.push するため、同一マウント中に
  // autoSaveKey が変化することはない。
  const [{ getSnapshot, subscribe }] = useState(() =>
    createDraftSnapshotStore(autoSaveKey),
  );

  const draft = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerDraftSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);

  // eslint-disable-next-line react-hooks/purity, @eslint-react/purity -- Client-side hook: 有効期限判定の基準時刻読み取りは意図的（shouldOfferDraftRestore の JSDoc 参照）
  const now = Date.now();
  const isAvailable =
    !dismissed && shouldOfferDraftRestore(draft, initialContentJson, now);

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
