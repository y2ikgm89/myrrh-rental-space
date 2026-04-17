import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  loginUrl: string;
  siteName: string;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function WelcomeEmail({
  loginUrl,
  siteName,
  greeting,
  intro,
  outro,
  preview,
  companyName,
  footerNote,
  supportContactText,
}: Props) {
  const mypageUrl = `${loginUrl}/mypage`;

  return (
    <EmailLayout
      preview={preview}
      companyName={companyName}
      footerNote={footerNote}
      supportContactText={supportContactText}
    >
      <Heading style={heading}>{siteName}へようこそ</Heading>

      <Text style={text}>{greeting}</Text>

      <Text style={text}>{intro}</Text>

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

      <Text style={text}>{outro}</Text>
    </EmailLayout>
  );
}

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

export default WelcomeEmail;
