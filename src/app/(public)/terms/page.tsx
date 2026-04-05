/**
 * /terms — 最初の有効な規約ページにリダイレクト
 *
 * 優先順位: TERMS_OF_USE → 任意のアクティブ規約 → 404
 */

import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/shared/db/prisma";
import { TermsType } from "@generated/prisma/enums";

export default async function TermsPage() {
  await connection();

  const firstTerms = await prisma.terms.findFirst({
    where: { isActive: true, type: TermsType.TERMS_OF_USE },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (firstTerms) {
    redirect(`/terms/${firstTerms.slug}`);
  }

  const anyTerms = await prisma.terms.findFirst({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (anyTerms) {
    redirect(`/terms/${anyTerms.slug}`);
  }

  notFound();
}
