import { Button } from "@/public/components/design-system/button";

interface DownloadReceiptFormProps {
  readonly serialNo: string;
  readonly token: string;
}

/**
 * ゲスト向け領収書 PDF ダウンロード用の POST フォーム (HTTP-02)。
 *
 * ## 意図
 * - **native `<form method="POST">` を使う (Server Component)** — client-side JS を
 *   経由せず、ブラウザ標準の form submission だけで動く。JS 無効環境 / progressive
 *   enhancement を担保。
 * - **token は hidden input で body に載せる** — Route Handler は
 *   `request.formData()` で読む。URL query に token が残らないため、Referer 経由の
 *   token leak も POST リクエストの多くのプロキシ経路で発生しない
 *   (browser は POST に対して Referer に query string を付けない実装が主流)。
 * - **POST の宛先は `/api/receipts/[serialNo]/pdf`** — 同一 Route Handler の
 *   POST method が single-use claim + PDF 返却を実施する。GET method は
 *   Better Auth session 経路 (mypage) 専用で、token は受け付けない。
 *
 * ## typedRoutes を意図的に迂回
 * `next.config.ts` で `typedRoutes: true`。この `action` は API route
 * (`/api/receipts/[serialNo]/pdf`) を指すが、typedRoutes は API route を
 * 型に含めないため直接文字列指定する (公式仕様、`<a href="/api/...">` と同型)。
 */
export function DownloadReceiptForm({
  serialNo,
  token,
}: DownloadReceiptFormProps) {
  const action = `/api/receipts/${serialNo}/pdf`;

  return (
    <form method="POST" action={action}>
      <input type="hidden" name="token" value={token} />
      <Button variant="primary" size="md" type="submit" className="self-start">
        領収書 PDF をダウンロードする
      </Button>
    </form>
  );
}
