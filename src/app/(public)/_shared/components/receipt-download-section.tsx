import type { ReactElement } from "react";

export interface ReceiptDownloadSectionProps {
  readonly href: string;
  /** 会員 API route 向け。指定時は `<a download>` を付与する。 */
  readonly downloadFilename?: string;
}

/**
 * 予約 / イベント詳細ハブ共通の領収書 PDF ダウンロード CTA。
 * href の組み立て (guest token URL vs member session API) は呼び出し側の責務。
 */
export function ReceiptDownloadSection({
  href,
  downloadFilename,
}: ReceiptDownloadSectionProps): ReactElement {
  return (
    <div className="border-t border-border px-4 py-4 sm:px-6">
      <p className="mb-3 text-sm text-muted-foreground">
        適格請求書 (領収書) は PDF でダウンロードできます。
      </p>
      <a
        href={href}
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        {...(downloadFilename ? { download: downloadFilename } : {})}
      >
        領収書をダウンロード
      </a>
    </div>
  );
}
