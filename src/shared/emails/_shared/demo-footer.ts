/**
 * プレビュー / react-email CLI / フィクスチャ用の静的フッターデータ。
 *
 * 実運用フッター（`getEmailFooterData`）は DB に依存する `'use cache'` 関数のため、
 * フィクスチャや CLI（`react-email dev`）から呼べない。プレビューでも DB 連携を
 * 強制するとオフラインで動かなくなる/初期セットアップ前に確認できないため、
 * 「デモフッター」を静的定数として提供する。
 *
 * 管理画面プレビューで「実フッターを使う」を選択した場合のみ `getEmailFooterData()`
 * を呼ぶ。デフォルトはこの定数を使用。
 */

import type { EmailFooterData } from "./footer-data";

export const DEMO_FOOTER: EmailFooterData = {
  businessName: "（株）デモ事業者",
  address: "〒100-0001 東京都千代田区千代田1-1-1 デモビル 1F",
  phoneNumber: "03-1234-5678",
  contactEmail: "info@example.com",
  siteName: "Demo Rental Space",
  siteUrl: "https://example.com",
  legalLinks: [
    { label: "利用規約", href: "https://example.com/terms/terms-of-use" },
    {
      label: "プライバシーポリシー",
      href: "https://example.com/terms/privacy-policy",
    },
    {
      label: "キャンセルポリシー",
      href: "https://example.com/terms/cancellation",
    },
    {
      label: "特定商取引法に基づく表記",
      href: "https://example.com/terms/commercial-transaction",
    },
  ],
};
