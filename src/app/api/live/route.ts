/**
 * Liveness Probe エンドポイント
 *
 * Cloud Run の liveness-probe 用。**外部依存に触れない**軽量チェック専用。
 * - DB 接続チェックなし（一時断でコンテナが kill され連鎖障害を引き起こすため）
 * - 認証なし
 * - プロセスがイベントループ応答可能であることだけを示す
 *
 * 役割分担:
 * - `/api/live`（本ファイル）: liveness-probe（kill 判定）
 * - `/api/health`: 監視・手動確認用（DB 疎通を含む詳細ヘルスチェック）
 * - startup-probe: `/api/live` を HTTP GET（Cloud Run 公式推奨）
 *
 * @see https://cloud.google.com/run/docs/configuring/healthchecks
 * @module api/live
 */

import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { status: "alive" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}
