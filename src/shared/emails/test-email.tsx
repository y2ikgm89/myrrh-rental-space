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
  recipientLabel: string;
  siteName: string;
  timestamp: string;
  triggeredByName: string;
  triggeredByEmail: string;
};

export function TestEmail({
  recipientLabel,
  siteName,
  timestamp,
  triggeredByName,
  triggeredByEmail,
}: Props) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>
        テスト送信 - {siteName}（{timestamp}）
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>テストメール</Heading>

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
              <strong>送信日時:</strong> {timestamp}
            </Text>
            <Text style={detailItem}>
              <strong>送信操作者:</strong> {triggeredByName}（{triggeredByEmail}
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

          <Text style={footer}>{siteName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default TestEmail;

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

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};
