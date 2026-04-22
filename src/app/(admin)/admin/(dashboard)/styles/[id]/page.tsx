/**
 * Style 詳細ページ（プレビュー + 使用箇所一覧）。
 */

import { IconPencil, IconCopy } from "@tabler/icons-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { Button } from "@/admin/components/ui";
import { deleteSectionStyleAction } from "@/app/(admin)/admin/(dashboard)/_shared/actions/section-styles/mutations";
import {
  getSectionStyleDetail,
  getSectionStyleUsageData,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/section-styles/queries";
import { parseSectionStylePayload } from "@/shared/lib/validations/section-style";
import { StylePreview } from "../_components/StylePreview";
import { StyleUsageTable } from "../_components/StyleUsageTable";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getSectionStyleDetail(id);
  return {
    title: detail ? `${detail.name} | Style Library` : "Style 詳細 | 管理画面",
  };
}

export default async function StyleDetailPage({ params }: Props) {
  const { id } = await params;
  const [detail, usage] = await Promise.all([
    getSectionStyleDetail(id),
    getSectionStyleUsageData(id),
  ]);

  if (!detail) {
    notFound();
  }

  const payload = parseSectionStylePayload({
    spacing: detail.spacing,
    background: detail.background,
    container: detail.container,
    typography: detail.typography,
    animation: detail.animation,
    ...(detail.customClass !== null && { customClass: detail.customClass }),
  });

  return (
    <AdminDetailLayout
      backHref="/admin/styles"
      title={detail.name}
      subtitle={detail.description ?? `scope: ${detail.scope}`}
      actions={
        <>
          <DetailDeleteButton
            itemName={detail.name}
            onDelete={deleteSectionStyleAction.bind(null, detail.id)}
            redirectTo="/admin/styles"
            successMessage="Style を削除しました"
          />
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/styles/new?baseId=${detail.id}`}>
              <IconCopy className="mr-2 h-4 w-4" />
              派生
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={`/admin/styles/${detail.id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <StylePreview payload={payload} />
        </div>
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">スコープ</dt>
              <dd className="font-medium text-foreground">{detail.scope}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">バージョン</dt>
              <dd className="font-medium text-foreground">{detail.version}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">派生数</dt>
              <dd className="font-medium text-foreground">
                {detail._count.derived}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">適用可能種別</dt>
              <dd className="font-medium text-foreground">
                {detail.applicableTypes.length === 0
                  ? "すべて"
                  : detail.applicableTypes.join(", ")}
              </dd>
            </div>
            {detail.customClass && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Custom class</dt>
                <dd className="font-mono text-xs text-foreground">
                  {detail.customClass}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">使用箇所</h2>
        <StyleUsageTable usage={usage} />
      </div>
    </AdminDetailLayout>
  );
}
