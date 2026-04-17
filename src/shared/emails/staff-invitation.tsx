import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { EmailLayout } from "./_layout";

type Props = {
  setupUrl: string;
  expiresAt: Date;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function StaffInvitationEmail({
  setupUrl,
  expiresAt,
  greeting,
  intro,
  outro,
  preview,
  companyName,
  footerNote,
  supportContactText,
}: Props) {
  const expiresAtFormatted = format(expiresAt, "yyyy年M月d日 HH:mm", {
    locale: ja,
  });

  return (
    <EmailLayout
      preview={preview}
      companyName={companyName}
      footerNote={footerNote}
      supportContactText={supportContactText}
    >
      <Heading style={heading}>スタッフ招待</Heading>

      <Text style={text}>{greeting}</Text>

      <Text style={text}>{intro}</Text>

      <Section style={buttonSection}>
        <Button style={button} href={setupUrl}>
          パスワードを設定する
        </Button>
      </Section>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>ご注意</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          このリンクの有効期限は <strong>{expiresAtFormatted}</strong> です。
        </Text>
        <Text style={detailItem}>
          有効期限が切れた場合は、管理者に再送を依頼してください。
        </Text>
        <Text style={detailItem}>
          このメールに心当たりがない場合は、無視してください。
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ボタンが機能しない場合は、以下のURLをブラウザに貼り付けてください:
      </Text>
      <Text style={urlText}>{setupUrl}</Text>

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

export default StaffInvitationEmail;
