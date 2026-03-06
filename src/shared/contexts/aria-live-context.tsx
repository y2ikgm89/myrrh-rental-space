"use client";

/**
 * ARIAライブリージョンContext
 *
 * スクリーンリーダー向けの動的コンテンツ通知システム
 * フォーム送信結果などをスクリーンリーダーに伝達する
 */

import {
  createContext,
  use,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";

/**
 * ARIAライブリージョンの優先度
 * - 'off': 通知なし
 * - 'polite': ユーザーがアイドル状態のときに通知
 * - 'assertive': 即座に通知（緊急性の高い情報のみ）
 */
export type AriaLivePoliteness = "off" | "polite" | "assertive";

interface AriaLiveContextValue {
  message: string;
  politeness: AriaLivePoliteness;
  announce: (message: string, politeness?: AriaLivePoliteness) => void;
  clear: () => void;
}

const AriaLiveContext = createContext<AriaLiveContextValue | undefined>(
  undefined,
);

interface AriaLiveProviderProps {
  children: ReactNode;
}

/**
 * ARIAライブリージョンProvider
 *
 * React 19: FC型は非推奨。通常の関数コンポーネントを使用
 */
export function AriaLiveProvider({
  children,
}: AriaLiveProviderProps): ReactElement {
  const [message, setMessage] = useState("");
  const [politeness, setPoliteness] = useState<AriaLivePoliteness>("polite");

  const announce = (
    newMessage: string,
    newPoliteness: AriaLivePoliteness = "polite",
  ) => {
    // 一度クリアしてから設定することで、同じメッセージでも再読み上げされる
    setMessage("");
    // 次のフレームで設定（スクリーンリーダーに確実に通知するため）
    requestAnimationFrame(() => {
      setMessage(newMessage);
      setPoliteness(newPoliteness);
    });
  };

  const clear = () => {
    setMessage("");
  };

  return (
    <AriaLiveContext value={{ message, politeness, announce, clear }}>
      {children}
    </AriaLiveContext>
  );
}

/**
 * ARIAライブリージョンHook
 * @throws AriaLiveProvider外で使用した場合にエラー
 */
export function useAriaLive(): AriaLiveContextValue {
  const context = use(AriaLiveContext);
  if (context === undefined) {
    throw new Error("useAriaLive must be used within AriaLiveProvider");
  }
  return context;
}

/**
 * ARIAライブリージョンHook（オプショナル）
 * Provider外で使用してもエラーにならない
 */
export function useAriaLiveOptional(): AriaLiveContextValue | null {
  return use(AriaLiveContext) ?? null;
}
