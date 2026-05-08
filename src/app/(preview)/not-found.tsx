import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プレビュー対象が見つかりません",
  description: "指定されたページのプレビューは存在しません。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="mb-3 text-xl font-bold tracking-tight text-foreground">
          プレビューが見つかりません
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          指定されたページは存在しないか、削除された可能性があります。
        </p>
        <Link
          href="/admin/pages"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          ページ一覧へ
        </Link>
      </div>
    </main>
  );
}
