import { Hr, Section, Text } from "@react-email/components";
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
  inquirySubject: string;
  newStatus: "RESOLVED" | "CLOSED";
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

export function InquiryStatusNotificationEmail({
  customerName,
  inquirySubject,
  newStatus,
  footer,
}: Props) {
  const info = SECTION_VARIANT_STYLES.info;

  return (
    <EmailLayout
      preview={`${HEADINGS[newStatus]} - ${inquirySubject}`}
      footer={footer}
    >
      <Text style={{ ...heading, color: COLOR.infoHeading }}>
        {HEADINGS[newStatus]}
      </Text>

      <Text style={text}>{customerName} 様</Text>

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
          <strong>件名:</strong> {inquirySubject}
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>{MESSAGES[newStatus]}</Text>
    </EmailLayout>
  );
}

InquiryStatusNotificationEmail.PreviewProps = inquiryStatusNotificationFixture;

export default InquiryStatusNotificationEmail;
