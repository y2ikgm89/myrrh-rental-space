import {
  Body,
  Button,
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
  loginUrl: string;
  siteName: string;
};

export function WelcomeEmail({ customerName, loginUrl, siteName }: Props) {
  const mypageUrl = `${loginUrl}/mypage`;

  return (
    <Html>
      <Head />
      <Preview>{siteName}へようこそ</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{siteName}へようこそ</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>
            ご登録いただき、誠にありがとうございます。
            マイページからご予約状況の確認やお問い合わせの管理が可能です。
          </Text>

          <Section style={buttonSection}>
            <Button style={button} href={mypageUrl}>
              マイページを開く
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください:
          </Text>
          <Text style={urlText}>{mypageUrl}</Text>

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

const buttonSection = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#0066cc",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
};

const urlText = {
  fontSize: "12px",
  color: "#8898aa",
  wordBreak: "break-all" as const,
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

export default WelcomeEmail;
