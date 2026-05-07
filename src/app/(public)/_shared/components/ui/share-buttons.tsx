"use client";

import {
  IconBookmark,
  IconBrandFacebook,
  IconBrandLine,
  IconBrandX,
  IconCheck,
  IconLink,
  IconShare,
  type TablerIcon,
} from "@tabler/icons-react";
import { useState, useSyncExternalStore } from "react";
import { useAriaLive } from "@/shared/contexts";

interface ShareButtonsProps {
  readonly url: string;
  readonly title: string;
}

interface ShareProvider {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly icon: TablerIcon;
  readonly buildHref: (url: string, title: string) => string;
}

const PROVIDERS: readonly ShareProvider[] = [
  {
    id: "x",
    label: "X",
    ariaLabel: "X でシェア",
    icon: IconBrandX,
    buildHref: (url, title) =>
      `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    ariaLabel: "Facebook でシェア",
    icon: IconBrandFacebook,
    buildHref: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: "line",
    label: "LINE",
    ariaLabel: "LINE で送る",
    icon: IconBrandLine,
    buildHref: (url) =>
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`,
  },
  {
    id: "hatena",
    label: "はてブ",
    ariaLabel: "はてなブックマークに追加",
    icon: IconBookmark,
    buildHref: (url, title) =>
      `https://b.hatena.ne.jp/entry/panel/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
];

const subscribeNoop = () => () => {};

function hasNativeShareSnapshot(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

function serverShareSnapshot(): boolean {
  return false;
}

const BUTTON_CLASSES =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:border-accent hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const { announce } = useAriaLive();
  const [copied, setCopied] = useState(false);
  const canNativeShare = useSyncExternalStore(
    subscribeNoop,
    hasNativeShareSnapshot,
    serverShareSnapshot,
  );

  function handleCopy() {
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        announce("リンクをコピーしました", "polite");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        announce("リンクのコピーに失敗しました", "assertive");
      });
  }

  function handleNativeShare() {
    void navigator.share({ title, url }).catch((error: unknown) => {
      if (error instanceof Error && error.name !== "AbortError") {
        announce("共有に失敗しました", "assertive");
      }
    });
  }

  return (
    <section aria-labelledby="share-heading" className="text-center">
      <h2
        id="share-heading"
        className="mb-4 text-sm font-medium text-foreground"
      >
        この記事をシェア
      </h2>
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {PROVIDERS.map(({ id, label, ariaLabel, icon: Icon, buildHref }) => (
          <li key={id}>
            <a
              href={buildHref(url, title)}
              target="_blank"
              rel="noreferrer"
              aria-label={ariaLabel}
              className={BUTTON_CLASSES}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{label}</span>
            </a>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "リンクをコピーしました" : "リンクをコピー"}
            className={BUTTON_CLASSES}
          >
            {copied ? (
              <IconCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <IconLink className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{copied ? "コピー済み" : "リンクをコピー"}</span>
          </button>
        </li>
        {canNativeShare ? (
          <li>
            <button
              type="button"
              onClick={handleNativeShare}
              aria-label="他のアプリで共有"
              className={BUTTON_CLASSES}
            >
              <IconShare className="h-4 w-4" aria-hidden="true" />
              <span>その他</span>
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
