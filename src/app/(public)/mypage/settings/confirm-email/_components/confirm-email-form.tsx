import { Button } from "@/public/components/design-system/button";

interface ConfirmEmailFormProps {
  readonly token: string;
}

/**
 * メールアドレス本人確認用 POST フォーム (HTTP-02)。
 *
 * link scanner は safe method (GET) のみプリフェッチするため、token 消費は
 * ユーザーの明示的なボタン押下による POST に切り分ける (receipt PDF 2-step と同型)。
 */
export function ConfirmEmailForm({ token }: ConfirmEmailFormProps) {
  return (
    <form method="POST" action="/api/customer/verify-email">
      <input type="hidden" name="token" value={token} />
      <Button variant="primary" size="md" type="submit" className="self-start">
        メールアドレスを登録する
      </Button>
    </form>
  );
}
