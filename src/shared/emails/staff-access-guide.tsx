import { Button, Hr, Section, Text } from "@react-email/components";
import { staffAccessGuideFixture } from "./staff-access-guide.fixture";
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
  staffEmail: string;
  roleLabel: string;
  adminUrl: string;
  footer: EmailFooterData;
};

export function StaffAccessGuideEmail({
  staffName,
  staffEmail,
  roleLabel,
  adminUrl,
  footer,
}: Props) {
  const info = SECTION_VARIANT_STYLES.info;

  return (
    <EmailLayout
      preview={`管理画面のご案内 - ${footer.businessName}`}
      footer={footer}
    >
      <Text style={heading}>管理画面のご案内</Text>

      <Text style={text}>{staffName} 様</Text>

      <Text style={text}>
        {footer.businessName} の管理スタッフとして登録されました。
        管理URLは管理者とスタッフで共通です。
      </Text>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={adminUrl}>
          管理画面を開く
        </Button>
      </Section>

      <Section
        style={{
          backgroundColor: info.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: info.heading }}>
          ログイン情報
        </Text>
        <Hr style={hr} />
        <Text style={detailItem}>管理URL: {adminUrl}</Text>
        <Text style={detailItem}>Googleアカウント: {staffEmail}</Text>
        <Text style={detailItem}>ロール: {roleLabel}</Text>
        <Text style={detailItem}>
          アプリ用パスワードはありません。GoogleアカウントとIAPで認証します。
        </Text>
        <Text style={detailItem}>
          アクセスできない場合は、管理者にIAPアクセス許可とスタッフ登録を確認してもらってください。
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
      </Text>
      <Text style={urlFallbackText}>{adminUrl}</Text>
    </EmailLayout>
  );
}

StaffAccessGuideEmail.PreviewProps = staffAccessGuideFixture;

export default StaffAccessGuideEmail;
