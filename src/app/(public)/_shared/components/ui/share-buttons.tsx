"use client";

import { IconBrandX, IconLink } from "@tabler/icons-react";
import { useState } from "react";

interface ShareButtonsProps {
  readonly url: string;
  readonly title: string;
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">シェア:</span>
      <button
        type="button"
        onClick={copyLink}
        className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={copied ? "コピーしました" : "リンクをコピー"}
      >
        <IconLink className="h-4 w-4" />
      </button>
      <a
        href={xShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="X (Twitter) でシェア"
      >
        <IconBrandX className="h-4 w-4" />
      </a>
      {copied ? (
        <span className="text-sm text-accent">コピーしました</span>
      ) : null}
    </div>
  );
}
