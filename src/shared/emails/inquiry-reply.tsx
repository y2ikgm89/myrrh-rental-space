import { Hr, Link, Section, Text } from "@react-email/components";
import { inquiryReplyFixture } from "./inquiry-reply.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  messageText,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  /** Inquiry.receiptNumber (「INQ-XXXXXXXX」)。件名・本文で目立つ位置に表示する。 */
  receiptNumber: string;
  subject: string;
  message: string;
  replyMessage: string;
  repliedByName: string;
  /** 会員向け: ログイン後のマイページ問い合わせ詳細 URL */
  memberInquiryUrl?: string;
  footer: EmailFooterData;
};

const repliedByStyle = {
  fontSize: "12px",
  color: COLOR.textSubtle,
  marginTop: "12px",
  textAlign: "right" as const,
};

const messageBox = {
  ...messageText,
  backgroundColor: COLOR.surface,
  padding: "12px",
  borderRadius: "4px",
  border: `1px solid ${COLOR.border}`,
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

export function InquiryReplyEmail({
  customerName,
  receiptNumber,
  subject,
  message,
  replyMessage,
  repliedByName,
  memberInquiryUrl,
  footer,
}: Props) {
  const info = SECTION_VARIANT_STYLES.info;

  return (
    <EmailLayout
      preview={`お問い合わせへの回答: ${subject} [${receiptNumber}]`}
      footer={footer}
    >
      <Text style={heading}>お問い合わせへの回答</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={receiptNumberStyle}>受付番号: {receiptNumber}</Text>

      <Text style={text}>
        お問い合わせいただきありがとうございます。 以下の通り回答いたします。
      </Text>

      <Section
        style={{
          backgroundColor: info.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: info.heading }}>回答内容</Text>
        <Hr style={hr} />
        <Text style={messageBox}>{replyMessage}</Text>
        <Text style={repliedByStyle}>回答者: {repliedByName}</Text>
      </Section>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お問い合わせ内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>受付番号:</strong> {receiptNumber}
        </Text>
        <Text style={detailItem}>
          <strong>件名:</strong> {subject}
        </Text>
        <Text style={detailItem}>
          <strong>内容:</strong>
        </Text>
        <Text style={messageBox}>{message}</Text>
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

      <Text style={text}>
        ご不明な点が残りましたら、再度お問い合わせください。
        お問い合わせの際は上記の受付番号をお伝えください。
      </Text>
    </EmailLayout>
  );
}

InquiryReplyEmail.PreviewProps = inquiryReplyFixture;

export default InquiryReplyEmail;
