"use client";

/**
 * グローバルエラーページ
 *
 * ルートレベルのエラーをキャッチ。
 * layout.tsxを上書きするため、html/bodyタグが必須。
 * Root IconLayout の外で動くため CSS 変数が存在しない — 全てインラインスタイルで記述。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";

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
      <body
        style={{
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          margin: 0,
          backgroundColor: "#fafafa",
          color: "#111",
        }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 1rem",
          }}
        >
          <div
            style={{ width: "100%", maxWidth: "28rem", textAlign: "center" }}
          >
            <div style={{ marginBottom: "2rem" }}>
              <svg
                style={{
                  margin: "0 auto",
                  display: "block",
                  height: "6rem",
                  width: "6rem",
                  color: "#dc2626",
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1
              style={{
                marginBottom: "1rem",
                fontSize: "1.5rem",
                fontWeight: "bold",
              }}
            >
              予期しないエラーが発生しました
            </h1>

            {/* global-error.tsx は CSS 変数・Tailwind 不使用（Root Layout 外のため） */}
            <p style={{ marginBottom: "2rem", color: "oklch(0.55 0.01 250)" }}>
              申し訳ございません。システムエラーが発生しました。
              <br />
              しばらく時間をおいてから再度お試しください。
            </p>

            {digest && (
              <p
                style={{
                  marginBottom: "1.5rem",
                  fontSize: "0.875rem",
                  color: "#999",
                }}
              >
                エラーID: {digest}
              </p>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <button
                onClick={() => unstable_retry()}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  backgroundColor: "#111",
                  color: "#fff",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                再試行する
              </button>
              {/* global-errorではRouterコンテキストが利用できないため、aタグを使用 */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  display: "inline-block",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #ddd",
                  backgroundColor: "#fff",
                  color: "#111",
                  fontWeight: 500,
                  textDecoration: "none",
                  fontSize: "1rem",
                  textAlign: "center",
                }}
              >
                ホームに戻る
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
