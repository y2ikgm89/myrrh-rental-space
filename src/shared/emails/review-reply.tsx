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
  spaceName: string;
  rating: number;
  originalTitle: string | null;
  originalComment: string | null;
  replyBody: string;
  siteName: string;
};

function renderStars(rating: number): string {
  const filled = "★".repeat(Math.max(0, Math.min(5, rating)));
  const empty = "☆".repeat(Math.max(0, 5 - Math.min(5, rating)));
  return `${filled}${empty}`;
}

export function ReviewReplyEmail({
  customerName,
  spaceName,
  rating,
  originalTitle,
  originalComment,
  replyBody,
  siteName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>【{spaceName}】レビューへのお返事が届きました</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>レビューへのお返事</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>
            この度は「{spaceName}」にレビューをご投稿いただき、
            誠にありがとうございます。以下の通りお返事いたします。
          </Text>

          <Section style={replySection}>
            <Text style={detailsHeading}>お店からのお返事</Text>
            <Hr style={hr} />
            <Text style={messageText}>{replyBody}</Text>
          </Section>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>お客様のレビュー</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>スペース:</strong> {spaceName}
            </Text>
            <Text style={detailItem}>
              <strong>評価:</strong> {renderStars(rating)} ({rating}/5)
            </Text>
            {originalTitle ? (
              <Text style={detailItem}>
                <strong>タイトル:</strong> {originalTitle}
              </Text>
            ) : null}
            {originalComment ? (
              <>
                <Text style={detailItem}>
                  <strong>コメント:</strong>
                </Text>
                <Text style={messageText}>{originalComment}</Text>
              </>
            ) : null}
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            今後ともご愛顧のほど、よろしくお願い申し上げます。
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

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

export default ReviewReplyEmail;
