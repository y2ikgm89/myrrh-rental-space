"use client";

/**
 * NewsPreviewContent — お知らせプレビュー本文
 *
 * sessionStorage からプレビューデータを読み取り、ArticleLayout の
 * children として ArticleHeader + Prose を描画する。
 * Layout / banner / CTA は呼び出し側（page.tsx）が担当。
 */

import type { ReactElement } from "react";
import { useRef, useSyncExternalStore } from "react";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { Prose } from "@/public/components/design-system/prose";
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

const SERVER_ERROR_STATE: PreviewState = {
  status: "error",
  message: "プレビューデータの読み込みに失敗しました。",
};

function readFromStorage(identifier: string): PreviewState {
  if (typeof window === "undefined") {
    return SERVER_ERROR_STATE;
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
    return SERVER_ERROR_STATE;
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
    () => SERVER_ERROR_STATE,
  );

  if (state.status === "error") {
    return (
      <p className="py-24 text-center text-sm text-muted-foreground">
        {state.message}
      </p>
    );
  }

  const { data } = state;

  return (
    <>
      <ArticleHeader title={data.title} publishedAt={data.publishedAt} />
      <Prose variant="editorial" className="max-w-none">
        <SanitizedHtml html={data.contentHtml} />
      </Prose>
    </>
  );
}
