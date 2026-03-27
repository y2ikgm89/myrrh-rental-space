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
  originalSubject: string;
  originalMessage: string;
  replyMessage: string;
  repliedByName: string;
  siteName: string;
};

export function InquiryReplyEmail({
  customerName,
  originalSubject,
  originalMessage,
  replyMessage,
  repliedByName,
  siteName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>お問い合わせへの回答: {originalSubject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>お問い合わせへの回答</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>
            お問い合わせいただきありがとうございます。
            以下の通り回答いたします。
          </Text>

          <Section style={replySection}>
            <Text style={detailsHeading}>回答内容</Text>
            <Hr style={hr} />
            <Text style={messageText}>{replyMessage}</Text>
            <Text style={repliedBy}>回答者: {repliedByName}</Text>
          </Section>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>お問い合わせ内容</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>件名:</strong> {originalSubject}
            </Text>
            <Text style={detailItem}>
              <strong>内容:</strong>
            </Text>
            <Text style={messageText}>{originalMessage}</Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            ご不明な点がございましたら、お気軽にお問い合わせください。
          </Text>

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
  color: "#1a1a1a",
  marginBottom: "24px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
};

const replySection = {
  backgroundColor: "#eef6ff",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsSection = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "12px",
};

const detailItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#484848",
  margin: "8px 0",
};

const messageText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#484848",
  whiteSpace: "pre-wrap",
  backgroundColor: "#ffffff",
  padding: "12px",
  borderRadius: "4px",
  border: "1px solid #e6e6e6",
};

const repliedBy = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "12px",
  textAlign: "right" as const,
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

export default InquiryReplyEmail;
