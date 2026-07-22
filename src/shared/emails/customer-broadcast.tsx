import { Hr, Section, Text } from "@react-email/components";
import { customerBroadcastFixture } from "./customer-broadcast.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  detailsHeading,
  detailsSection,
  heading,
  hr,
  text,
} from "./_shared/styles";

type Props = {
  /** 管理者が入力した件名。本メールの subject にも使う。 */
  subject: string;
  /**
   * 管理者が入力した本文（plain text）。全員共通の body として送るため
   * 個人名プレースホルダは含めない（EventBroadcastEmail と同じ設計判断）。
   * React のデフォルトエスケープ（テキストノードとして描画、raw HTML 注入を許可しない）+
   * `whiteSpace: "pre-wrap"` で改行のみ保持して描画する。
   */
  bodyText: string;
  footer: EmailFooterData;
};

/**
 * 管理者オーサリング型 顧客一斉配信（Phase 4: 顧客管理強化）。
 *
 * `EventBroadcastEmail`（T12）と同じ設計判断: 全員共通の件名・本文を送る
 * ため customerName を含めない。個別署名が必要なユースケースは対象外。
 * イベント一斉配信と異なり特定イベントに紐づかないため eventTitle/eventUrl は持たない。
 */
export function CustomerBroadcastEmail({ subject, bodyText, footer }: Props) {
  return (
    <EmailLayout preview={subject} footer={footer}>
      <Text style={heading}>{subject}</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お知らせ内容</Text>
        <Hr style={hr} />
        <Text style={{ ...text, whiteSpace: "pre-wrap", margin: 0 }}>
          {bodyText}
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、本メールへ返信いただくかお問い合わせフォームより
        ご連絡ください。
      </Text>
    </EmailLayout>
  );
}

CustomerBroadcastEmail.PreviewProps = customerBroadcastFixture;

export default CustomerBroadcastEmail;
