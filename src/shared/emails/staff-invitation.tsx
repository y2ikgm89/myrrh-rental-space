import { Button, Hr, Section, Text } from "@react-email/components";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { staffInvitationFixture } from "./staff-invitation.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  SECTION_VARIANT_STYLES,
  buttonPrimary,
  buttonSection,
  detailItem,
  detailsHeading,
  heading,
  hr,
  text,
  urlFallbackText,
} from "./_shared/styles";

type Props = {
  staffName: string;
  setupUrl: string;
  expiresAt: Date;
  footer: EmailFooterData;
};

export function StaffInvitationEmail({
  staffName,
  setupUrl,
  expiresAt,
  footer,
}: Props) {
  const expiresAtFormatted = format(expiresAt, "yyyy年M月d日 HH:mm", {
    locale: ja,
  });
  const warning = SECTION_VARIANT_STYLES.warning;

  return (
    <EmailLayout
      preview={`スタッフ招待 - ${footer.businessName}`}
      footer={footer}
    >
      <Text style={heading}>スタッフ招待</Text>

      <Text style={text}>{staffName} 様</Text>

      <Text style={text}>
        {footer.businessName} の管理者として招待されました。
        以下のボタンをクリックして、パスワードを設定してください。
      </Text>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={setupUrl}>
          パスワードを設定する
        </Button>
      </Section>

      <Section
        style={{
          backgroundColor: warning.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: warning.heading }}>
          ご注意・セキュリティ
        </Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          このリンクの有効期限は <strong>{expiresAtFormatted}</strong> です。
        </Text>
        <Text style={detailItem}>
          有効期限が切れた場合は、招待元の管理者に再送を依頼してください。
        </Text>
        <Text style={detailItem}>
          <strong>このメールに心当たりがない場合は、無視してください。</strong>
          身に覚えのない招待が繰り返し届く場合は、招待元の管理者へご連絡ください。
        </Text>
        <Text style={detailItem}>
          パスワード設定リンクをクリックする前に、URL のドメインが正しいことを
          ご確認ください。当サービスがメールでパスワード等の認証情報を尋ねることは
          ありません。
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
      </Text>
      <Text style={urlFallbackText}>{setupUrl}</Text>
    </EmailLayout>
  );
}

StaffInvitationEmail.PreviewProps = staffInvitationFixture;

export default StaffInvitationEmail;
