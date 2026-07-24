import { Button, Hr, Section, Text } from "@react-email/components";
import { inquiryCustomerReplyAdminFixture } from "./inquiry-customer-reply-admin.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  buttonSecondary,
  buttonSection,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  messageText,
} from "./_shared/styles";

type Props = {
  customerName: string;
  /** Inquiry.receiptNumber (「INQ-XXXXXXXX」)。管理者側でも突合の主キー。 */
  receiptNumber: string;
  subject: string;
  replyMessage: string;
  adminUrl: string;
  footer: EmailFooterData;
};

const messageBox = {
  ...messageText,
  backgroundColor: COLOR.surface,
  padding: "12px",
  borderRadius: "4px",
  border: `1px solid ${COLOR.border}`,
};

export function InquiryCustomerReplyAdminEmail({
  customerName,
  receiptNumber,
  subject,
  replyMessage,
  adminUrl,
  footer,
}: Props) {
  return (
    <EmailLayout
      preview={`[お問い合わせ続報] ${subject} - ${customerName}様 [${receiptNumber}]`}
      footer={footer}
    >
      <Text style={{ ...heading, color: "#1d4ed8" }}>【お問い合わせ続報】</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>続報内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>受付番号:</strong> {receiptNumber}
        </Text>
        <Text style={detailItem}>
          <strong>お名前:</strong> {customerName}
        </Text>
        <Text style={detailItem}>
          <strong>件名:</strong> {subject}
        </Text>
        <Text style={detailItem}>
          <strong>メッセージ:</strong>
        </Text>
        <Text style={messageBox}>{replyMessage}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={adminUrl} style={buttonSecondary}>
          管理画面で確認
        </Button>
      </Section>
    </EmailLayout>
  );
}

InquiryCustomerReplyAdminEmail.PreviewProps = inquiryCustomerReplyAdminFixture;

export default InquiryCustomerReplyAdminEmail;
