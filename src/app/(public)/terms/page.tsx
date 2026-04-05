/**
 * /terms — 最初の有効な規約ページにリダイレクト
 *
 * 優先順位: TERMS_OF_USE → 任意のアクティブ規約 → 404
 */

import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { getFirstActiveTermsSlug } from "@/shared/domain/terms/public-queries";

export default async function TermsPage() {
  await connection();

  const slug = await getFirstActiveTermsSlug();

  if (slug) {
    redirect(`/terms/${slug}`);
  }

  notFound();
}
