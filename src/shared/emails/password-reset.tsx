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
  name: string;
  resetUrl: string;
  siteName: string;
};

export function PasswordResetEmail({ name, resetUrl, siteName }: Props) {
  return (
    <Html>
      <Head />
      <Preview>パスワードリセット - {siteName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>パスワードリセット</Heading>

          <Text style={text}>{name} 様</Text>

          <Text style={text}>
            パスワードリセットのリクエストを受け付けました。
            以下のボタンをクリックして、新しいパスワードを設定してください。
          </Text>

          <Section style={buttonSection}>
            <Button style={button} href={resetUrl}>
              パスワードをリセットする
            </Button>
          </Section>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>ご注意</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              このリンクの有効期限は <strong>1時間</strong> です。
            </Text>
            <Text style={detailItem}>
              有効期限が切れた場合は、再度リセットをリクエストしてください。
            </Text>
            <Text style={detailItem}>
              このメールに心当たりがない場合は、無視してください。
              パスワードは変更されません。
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください:
          </Text>
          <Text style={urlText}>{resetUrl}</Text>

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

const detailsSection = {
  backgroundColor: "#fef9e7",
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

const urlText = {
  fontSize: "12px",
  color: "#8898aa",
  wordBreak: "break-all" as const,
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

export default PasswordResetEmail;
