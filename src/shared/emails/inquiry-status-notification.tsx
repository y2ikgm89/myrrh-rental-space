import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  customerName: string;
  inquirySubject: string;
  newStatus: "RESOLVED" | "CLOSED";
  siteName: string;
};

const HEADINGS: Record<Props["newStatus"], string> = {
  RESOLVED: "お問い合わせの対応が完了しました",
  CLOSED: "お問い合わせを終了いたしました",
};

const MESSAGES: Record<Props["newStatus"], string> = {
  RESOLVED:
    "お問い合わせの内容について対応が完了しましたのでお知らせいたします。\nまたご不明な点がございましたらお気軽にご連絡ください。",
  CLOSED:
    "お問い合わせを終了いたしました。\n再度ご相談の際は新規のお問い合わせとしてご連絡ください。",
};

export function InquiryStatusNotificationEmail({
  customerName,
  inquirySubject,
  newStatus,
  siteName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>
        {HEADINGS[newStatus]} - {inquirySubject}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{HEADINGS[newStatus]}</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>お問い合わせ内容</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>件名:</strong> {inquirySubject}
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>{MESSAGES[newStatus]}</Text>

          <Text style={footer}>{siteName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
};

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1d4ed8",
  marginBottom: "24px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
};

const detailsSection = {
  backgroundColor: "#eff6ff",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#1e40af",
  marginBottom: "12px",
};

const detailItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#484848",
  margin: "8px 0",
};

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

export default InquiryStatusNotificationEmail;
