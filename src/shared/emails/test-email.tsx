import { Hr, Link, Section, Text } from "@react-email/components";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { testEmailFixture } from "./test-email.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  text,
} from "./_shared/styles";

type TestEmailProps = {
  recipientLabel: string;
  siteName: string;
  /** 送信日時。テンプレ内部で JST 整形する。 */
  timestamp: Date;
  triggeredByName: string;
  triggeredByEmail: string;
  footer: EmailFooterData;
};

function formatJst(date: Date): string {
  return `${format(date, "yyyy年M月d日 (EEEE) HH:mm:ss", { locale: ja })} JST`;
}

export function TestEmail({
  recipientLabel,
  siteName,
  timestamp,
  triggeredByName,
  triggeredByEmail,
  footer,
}: TestEmailProps) {
  const formatted = formatJst(timestamp);
  return (
    <EmailLayout
      preview={`テスト送信 - ${siteName}（${formatted}）`}
      footer={footer}
    >
      <Text style={heading}>テストメール</Text>

      <Text style={text}>
        このメールは {siteName} のメール送信設定が正しく機能しているかを
        確認するためのテストメールです。実際の予約・通知・お知らせとは
        関係ありません。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>送信情報</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>宛先:</strong> {recipientLabel}
        </Text>
        <Text style={detailItem}>
          <strong>送信日時:</strong> {formatted}
        </Text>
        <Text style={detailItem}>
          <strong>送信操作者:</strong> {triggeredByName}（
          <Link
            href={`mailto:${triggeredByEmail}`}
            style={{ color: COLOR.link, textDecoration: "underline" }}
          >
            {triggeredByEmail}
          </Link>
          ）
        </Text>
      </Section>

      <Text style={text}>
        このメールが正しい宛先に届いていれば、送信元ドメイン・Reply-To・
        DNS（SPF / DKIM / DMARC）・Resend API の全段が正常に機能して
        います。届かない／迷惑メールフォルダに入る等の問題があれば、
        管理画面のメール設定および Resend ダッシュボードを確認してください。
      </Text>

      <Hr style={hr} />
    </EmailLayout>
  );
}

TestEmail.PreviewProps = testEmailFixture;

export default TestEmail;
