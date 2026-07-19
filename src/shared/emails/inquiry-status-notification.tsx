import { Hr, Link, Section, Text } from "@react-email/components";
import { inquiryStatusNotificationFixture } from "./inquiry-status-notification.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  heading,
  hr,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  /** Inquiry.receiptNumber (「INQ-XXXXXXXX」)。件名末尾・本文冒頭で目立つ位置に表示する。 */
  receiptNumber: string;
  inquirySubject: string;
  newStatus: "RESOLVED" | "CLOSED";
  /** 会員向け: ログイン後のマイページ問い合わせ詳細 URL */
  memberInquiryUrl?: string;
  footer: EmailFooterData;
};

const HEADINGS: Record<Props["newStatus"], string> = {
  RESOLVED: "お問い合わせの対応が完了しました",
  CLOSED: "お問い合わせを終了いたしました",
};

const MESSAGES: Record<Props["newStatus"], string> = {
  RESOLVED:
    "お問い合わせの内容について対応が完了しましたのでお知らせいたします。\nまたご不明な点がございましたら、お気軽にご連絡ください。",
  CLOSED:
    "お問い合わせを終了いたしました。\n再度ご相談の際は、新規のお問い合わせとしてご連絡ください。",
};

const receiptNumberStyle = {
  ...text,
  fontWeight: 700,
  color: COLOR.text,
  backgroundColor: COLOR.surface,
  padding: "8px 12px",
  borderRadius: "4px",
  border: `1px solid ${COLOR.border}`,
  margin: "16px 0",
};

export function InquiryStatusNotificationEmail({
  customerName,
  receiptNumber,
  inquirySubject,
  newStatus,
  memberInquiryUrl,
  footer,
}: Props) {
  const info = SECTION_VARIANT_STYLES.info;

  return (
    <EmailLayout
      preview={`${HEADINGS[newStatus]} - ${inquirySubject} [${receiptNumber}]`}
      footer={footer}
    >
      <Text style={{ ...heading, color: COLOR.infoHeading }}>
        {HEADINGS[newStatus]}
      </Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={receiptNumberStyle}>受付番号: {receiptNumber}</Text>

      <Section
        style={{
          backgroundColor: info.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: info.heading }}>
          お問い合わせ内容
        </Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>受付番号:</strong> {receiptNumber}
        </Text>
        <Text style={detailItem}>
          <strong>件名:</strong> {inquirySubject}
        </Text>
      </Section>

      {memberInquiryUrl && (
        <Text style={text}>
          <Link
            href={memberInquiryUrl}
            style={{ color: COLOR.link, textDecoration: "underline" }}
          >
            マイページでお問い合わせを確認する
          </Link>
        </Text>
      )}

      <Hr style={hr} />

      <Text style={text}>{MESSAGES[newStatus]}</Text>
    </EmailLayout>
  );
}

InquiryStatusNotificationEmail.PreviewProps = inquiryStatusNotificationFixture;

export default InquiryStatusNotificationEmail;
