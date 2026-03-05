"use client";

/**
 * PostPreviewContent — 投稿プレビュークライアントコンポーネント
 *
 * sessionStorage からプレビューデータを読み取り表示する。
 * ?preview=true クエリ付きの /posts/[slug] ページで使用。
 * dynamic({ ssr: false }) 経由でのみ利用されるため SSR は行われない。
 */

import type { ReactElement } from "react";
import { useRef, useSyncExternalStore } from "react";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ArticleDetailHero } from "@/public/components/ArticleDetailHero";
import {
  getPreviewStorageKey,
  isPreviewDataValid,
  PostPreviewContainerSchema,
  type PostPreviewData,
} from "@/shared/types";

export interface PostPreviewContentProps {
  identifier: string;
}

type PreviewState =
  | { status: "error"; message: string }
  | { status: "ready"; data: PostPreviewData };

function readFromStorage(identifier: string): PreviewState {
  if (typeof window === "undefined") {
    // dynamic({ ssr: false }) により、このパスは到達しない
    return {
      status: "error",
      message: "プレビューデータの読み込みに失敗しました。",
    };
  }

  const key = getPreviewStorageKey("post", identifier);
  const raw = sessionStorage.getItem(key);

  if (!raw) {
    return {
      status: "error",
      message:
        "プレビューデータが見つかりません。管理画面からプレビューを開いてください。",
    };
  }

  try {
    const container: unknown = JSON.parse(raw);
    const parsed = PostPreviewContainerSchema.safeParse(container);
    if (!parsed.success) {
      return {
        status: "error",
        message:
          "プレビューデータの形式が不正です。再度プレビューを開いてください。",
      };
    }
    if (!isPreviewDataValid(parsed.data.timestamp)) {
      return {
        status: "error",
        message:
          "プレビューデータの有効期限が切れています（30分）。再度プレビューを開いてください。",
      };
    }
    return { status: "ready", data: parsed.data.data };
  } catch {
    return {
      status: "error",
      message: "プレビューデータの読み込みに失敗しました。",
    };
  }
}

export function PostPreviewContent({
  identifier,
}: PostPreviewContentProps): ReactElement {
  const snapshotRef = useRef<PreviewState | null>(null);
  const state = useSyncExternalStore(
    () => () => {},
    () => {
      snapshotRef.current ??= readFromStorage(identifier);
      return snapshotRef.current;
    },
    (): PreviewState => ({
      status: "error",
      message: "プレビューデータの読み込みに失敗しました。",
    }),
  );

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  const { data } = state;

  return (
    <>
      <div className="bg-primary/10 py-2 text-center text-xs text-primary">
        プレビューモード — このページは公開されていません
      </div>
      <ArticleDetailHero
        title={data.title}
        categoryName={data.category.name}
        publishedAt={data.publishedAt}
        authorName={null}
      />
      <article className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <SanitizedHtml
          html={data.contentHtml}
          className="prose prose-lg max-w-none"
        />
        {data.tags.length > 0 && (
          <div className="mt-12 border-t border-border pt-6">
            <div className="flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  );
}
