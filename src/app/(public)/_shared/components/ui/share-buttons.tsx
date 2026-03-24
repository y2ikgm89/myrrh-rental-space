"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";

/** X (formerly Twitter) アイコン — lucide-react v1.0 でブランドアイコン削除のため自前定義 */
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

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
        className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-accent"
        aria-label={copied ? "コピーしました" : "リンクをコピー"}
      >
        <Link2 className="h-4 w-4" />
      </button>
      <a
        href={xShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-accent"
        aria-label="X (Twitter) でシェア"
      >
        <XIcon className="h-4 w-4" />
      </a>
      {copied ? (
        <span className="text-sm text-accent">コピーしました</span>
      ) : null}
    </div>
  );
}
