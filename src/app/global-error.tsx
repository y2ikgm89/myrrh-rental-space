"use client";

/**
 * グローバルエラーページ
 *
 * ルートレベルのエラーをキャッチ。
 * layout.tsxを上書きするため、html/bodyタグが必須。
 * Root Layout の外で動くため CSS 変数が存在しない — global-error.css で静的スタイル。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import "./global-error.css";

export default function GlobalError({ error, unstable_retry }: ErrorInfo) {
  const digest = "digest" in error ? String(error.digest) : undefined;

  useEffect(() => {
    console.error("Global error boundary triggered", {
      error: error.message,
      digest,
    });
  }, [error, digest]);

  return (
    <html lang="ja">
      <head>
        {/*
         * "use client" のため viewport export で colorScheme を宣言できないので、
         * React 19 の metadata hoisting を使い <meta> を JSX で直接描画する。
         * ハードコード light 配色 (#fafafa / #111 / #dc2626) が Chrome Auto Dark
         * Theme / Samsung Internet 強制ダーク / Apple Mail 自動反転で崩れるのを防ぐ。
         */}
        <meta name="color-scheme" content="light" />
      </head>
      <body>
        <div className="ge-shell">
          <div className="ge-card">
            <div className="ge-icon-wrap">
              <svg
                className="ge-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 className="ge-title">予期しないエラーが発生しました</h1>

            <p className="ge-message">
              申し訳ございません。システムエラーが発生しました。
              <br />
              しばらく時間をおいてから再度お試しください。
            </p>

            {digest && <p className="ge-digest">エラーID: {digest}</p>}

            <div className="ge-actions">
              <button
                type="button"
                onClick={() => unstable_retry()}
                className="ge-btn-primary"
              >
                再試行する
              </button>
              {/* global-errorではRouterコンテキストが利用できないため、aタグを使用 */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="ge-btn-secondary">
                ホームに戻る
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
