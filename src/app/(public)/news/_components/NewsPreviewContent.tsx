"use client";

/**
 * NewsPreviewContent — お知らせプレビュークライアントコンポーネント
 *
 * sessionStorage からプレビューデータを読み取り表示する。
 * /news/preview/[slug] ページで使用。
 * dynamic({ ssr: false }) 経由でのみ利用されるため SSR は行われない。
 */

import type { ReactElement } from "react";
import { useRef, useSyncExternalStore } from "react";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ArticleDetailHero } from "@/public/components/ArticleDetailHero";
import {
  getPreviewStorageKey,
  isPreviewDataValid,
  NewsPreviewContainerSchema,
  type NewsPreviewData,
} from "@/shared/types";

export interface NewsPreviewContentProps {
  identifier: string;
}

type PreviewState =
  | { status: "error"; message: string }
  | { status: "ready"; data: NewsPreviewData };

function readFromStorage(identifier: string): PreviewState {
  if (typeof window === "undefined") {
    // dynamic({ ssr: false }) により、このパスは到達しない
    return {
      status: "error",
      message: "プレビューデータの読み込みに失敗しました。",
    };
  }

  const key = getPreviewStorageKey("news", identifier);
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
    const parsed = NewsPreviewContainerSchema.safeParse(container);
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

export function NewsPreviewContent({
  identifier,
}: NewsPreviewContentProps): ReactElement {
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
      <ArticleDetailHero title={data.title} publishedAt={data.publishedAt} />
      <article className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <SanitizedHtml
          html={data.contentHtml}
          className="prose prose-lg max-w-none"
        />
      </article>
    </>
  );
}
