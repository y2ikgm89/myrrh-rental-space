import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedTermsList } from "@/shared/domain/terms/queries";
import { TERMS_TYPE_LABELS } from "@/shared/lib/validations/terms";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const settings = await getSeoSettings();
  return generateArticleMetadata(
    {
      title: "規約一覧",
      description: "利用規約・プライバシーポリシー・キャンセルポリシー等の一覧",
    },
    settings,
    { canonicalUrl: `${getBaseUrl()}/terms` },
  );
}

export default async function TermsListPage() {
  await connection();
  const items = await getPublishedTermsList();

  return (
    <ArticleLayout
      breadcrumb={[{ label: "規約一覧" }]}
      contentWidth={LayoutWidth.MD}
      showSidebar={false}
    >
      <Stack gap="xl">
        <Heading level={1}>規約一覧</Heading>
        {items.length === 0 ? (
          <p className="text-muted-foreground">
            現在公開中の規約はありません。
          </p>
        ) : (
          <ul className="divide-y divide-divider">
            {items.map((item) => (
              <li key={item.id} className="py-6">
                <Link
                  href={`/terms/${item.slug}`}
                  className="group block transition-colors hover:bg-accent/5"
                >
                  <div className="text-xs uppercase tracking-eyebrow text-muted-foreground">
                    {TERMS_TYPE_LABELS[item.type] ?? item.type}
                  </div>
                  <div className="mt-2 font-heading text-xl font-light text-foreground transition-colors group-hover:text-accent">
                    {item.title}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Stack>
    </ArticleLayout>
  );
}
