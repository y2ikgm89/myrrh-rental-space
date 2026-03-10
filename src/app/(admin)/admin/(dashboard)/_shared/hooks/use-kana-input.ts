"use client";

/**
 * IME 入力時にカナを自動取得するフック
 *
 * 日本語入力時に変換前のひらがなを追跡し、
 * カタカナに変換してリアルタイムで表示します。
 *
 * - confirmedKana: 変換確定済みのカナ
 * - previewKana: 入力中のカナ（プレビュー）
 * - kana: 表示用（confirmedKana + previewKana）
 */

import { useRef, useState } from "react";

interface UseKanaInputOptions {
  /** カナが変更された時のコールバック */
  onKanaChange?: (kana: string) => void;
  /** 初期値 */
  initialKana?: string;
}

interface UseKanaInputReturn {
  /** 取得されたカナ（確定 + プレビュー） */
  kana: string;
  /** カナを手動設定（確定カナをリセット） */
  setKana: (kana: string) => void;
  /** input に適用するプロパティ */
  inputProps: {
    onCompositionStart: () => void;
    onCompositionUpdate: (e: React.CompositionEvent<HTMLInputElement>) => void;
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => void;
    onInput: (e: React.FormEvent<HTMLInputElement>) => void;
  };
}

/**
 * ひらがなをカタカナに変換
 */
function toKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) + 0x60),
  );
}

/**
 * 文字列がひらがなのみかチェック（カタカナは含まない）
 */
function isHiraganaOnly(str: string): boolean {
  return /^[\u3040-\u309F\u30FC]*$/.test(str);
}

/**
 * 文字列がひらがな・カタカナのみかチェック
 */
function isKanaOnly(str: string): boolean {
  return /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB]*$/.test(str);
}

/**
 * IME 入力時にカナを自動取得するフック
 */
export function useKanaInput(
  options: UseKanaInputOptions = {},
): UseKanaInputReturn {
  const { onKanaChange, initialKana = "" } = options;

  // 確定済みカナ
  const [confirmedKana, setConfirmedKana] = useState(initialKana);
  // 入力中のプレビューカナ
  const [previewKana, setPreviewKana] = useState("");

  // 変換中フラグ
  const isComposingRef = useRef(false);
  // 変換中のひらがな（compositionend で使用）
  const lastHiraganaRef = useRef("");

  // 表示用カナ（確定 + プレビュー）
  const kana = confirmedKana + previewKana;

  const setKana = (newKana: string) => {
    setConfirmedKana(newKana);
    setPreviewKana("");
    onKanaChange?.(newKana);
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
    lastHiraganaRef.current = "";
    setPreviewKana("");
  };

  const handleCompositionUpdate = (
    e: React.CompositionEvent<HTMLInputElement>,
  ) => {
    const data = e.data;
    if (!data) return;

    // ひらがなの場合、プレビューを更新
    if (isHiraganaOnly(data)) {
      lastHiraganaRef.current = data;
      const katakana = toKatakana(data);
      setPreviewKana(katakana);
    } else {
      // 漢字変換中などはプレビューをクリア
      setPreviewKana("");
    }
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLInputElement>,
  ) => {
    isComposingRef.current = false;

    // 最終的に確定する文字列を決定
    let finalKana = "";

    const finalData = e.data;
    if (finalData && isKanaOnly(finalData)) {
      // ひらがな/カタカナで確定された場合（そのまま確定）
      finalKana = toKatakana(finalData);
    } else if (lastHiraganaRef.current) {
      // 漢字に変換された場合、最後に保存したひらがなを使用
      finalKana = toKatakana(lastHiraganaRef.current);
    }

    // プレビューをクリアして確定カナに追加
    setPreviewKana("");

    if (finalKana) {
      setConfirmedKana((prev) => {
        const newKana = prev + finalKana;
        onKanaChange?.(newKana);
        return newKana;
      });
    }

    lastHiraganaRef.current = "";
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const currentValue = target.value;

    // 入力フィールドが空になったらカナもクリア
    if (currentValue === "") {
      setConfirmedKana("");
      setPreviewKana("");
      lastHiraganaRef.current = "";
      onKanaChange?.("");
      return;
    }

    // composition 中でない場合はスキップ
    if (!isComposingRef.current) return;

    // InputEvent の data を取得（フォールバック用）
    const nativeEvent = e.nativeEvent;
    const inputData =
      nativeEvent instanceof InputEvent ? nativeEvent.data : null;

    // ひらがな入力時、lastHiraganaRef を更新
    if (inputData && isHiraganaOnly(inputData)) {
      // 差分追加（compositionUpdate が取れない場合のフォールバック）
      if (!lastHiraganaRef.current) {
        lastHiraganaRef.current = inputData;
        setPreviewKana(toKatakana(inputData));
      }
    }
  };

  return {
    kana,
    setKana,
    inputProps: {
      onCompositionStart: handleCompositionStart,
      onCompositionUpdate: handleCompositionUpdate,
      onCompositionEnd: handleCompositionEnd,
      onInput: handleInput,
    },
  };
}
