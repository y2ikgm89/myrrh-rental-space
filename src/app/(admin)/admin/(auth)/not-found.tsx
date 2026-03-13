import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ページが見つかりません",
};

export default function AuthNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
          ページが見つかりません
        </h1>
        <p className="mb-8 text-muted-foreground">
          お探しのページは存在しないか、移動された可能性があります。
        </p>
        <Link
          href="/admin/login"
          className="inline-block rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          ログインに戻る
        </Link>
      </div>
    </div>
  );
}
