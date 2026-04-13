/**
 * /privacy → /terms/privacy-policy へ永続リダイレクト
 *
 * プライバシーポリシーは Terms システムで管理。
 * 既存リンク・ブックマーク・SEO のために 308 リダイレクトを維持。
 */

import { permanentRedirect } from "next/navigation";

export default function PrivacyPage() {
  permanentRedirect("/terms/privacy-policy");
}
