import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { generateArticleMetadata } from "@/public/lib/seo/metadata-factory";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublicTermsBySlug } from "@/shared/domain/terms/queries";
import { TermsDetailPageContent } from "@/app/(public)/terms/_components/terms-detail-page-content";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const terms = await getPublicTermsBySlug(slug);

  if (!terms) {
    return { title: "規約が見つかりません" };
  }

  return generateArticleMetadata(
    {
      title: terms.title,
      description: `${terms.title}をご確認ください。`,
    },
    {
      canonicalUrl: `${getBaseUrl()}/terms/${slug}`,
    },
  );
}

export default async function TermsDetailPage({ params }: PageProps) {
  await connection();

  const { slug } = await params;
  const terms = await getPublicTermsBySlug(slug);

  if (!terms) {
    notFound();
  }

  return <TermsDetailPageContent terms={terms} />;
}
