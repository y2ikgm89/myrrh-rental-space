/**
 * Style 使用箇所テーブル（Server Component）。
 * sections / pages / settings の 3 セクションに分けて表示。
 */

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import type { SectionStyleUsage } from "@/shared/domain/section-styles/queries";

export function StyleUsageTable({ usage }: { usage: SectionStyleUsage }) {
  const totalUsage =
    usage.sections.length + usage.pages.length + usage.settings.length;

  if (totalUsage === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        この Style はまだ使用されていません。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {usage.settings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            グローバル設定 ({usage.settings.length})
          </h3>
          <div className="overflow-hidden rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            Settings.globalSectionStyle に設定されています。
          </div>
        </section>
      )}

      {usage.pages.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            ページ default ({usage.pages.length})
          </h3>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>タイトル</TableHead>
                    <TableHead>スラッグ</TableHead>
                    <TableHead>リンク</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.pages.map((page) => (
                    <TableRow key={page.id}>
                      <TableCell>{page.title}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {page.slug}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/pages/${page.slug}/edit`}
                          className="text-primary hover:underline"
                        >
                          編集
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}

      {usage.sections.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            セクション ({usage.sections.length})
          </h3>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>セクション種別</TableHead>
                    <TableHead>ページ</TableHead>
                    <TableHead>リンク</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.sections.map((section) => (
                    <TableRow key={section.id}>
                      <TableCell>{section.type}</TableCell>
                      <TableCell>
                        {section.page ? (
                          <span>
                            {section.page.title}
                            <span className="ml-2 text-xs text-muted-foreground">
                              /{section.page.slug}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">(不明)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {section.page && (
                          <Link
                            href={`/admin/pages/${section.page.slug}/edit`}
                            className="text-primary hover:underline"
                          >
                            編集
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
