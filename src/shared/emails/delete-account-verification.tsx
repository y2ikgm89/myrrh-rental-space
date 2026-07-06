import { Button, Hr, Section, Text } from "@react-email/components";
import { deleteAccountVerificationFixture } from "./delete-account-verification.fixture";
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
  name: string;
  deletionUrl: string;
  siteName: string;
  footer: EmailFooterData;
};

export function DeleteAccountVerificationEmail({
  name,
  deletionUrl,
  siteName,
  footer,
}: Props) {
  const warning = SECTION_VARIANT_STYLES.warning;

  return (
    <EmailLayout preview={`アカウント削除の確認 - ${siteName}`} footer={footer}>
      <Text style={heading}>アカウント削除の確認</Text>

      <Text style={text}>{name} 様</Text>

      <Text style={text}>
        アカウント削除のリクエストを受け付けました。
        以下のボタンをクリックすると、アカウントとすべての関連データが完全に削除されます。
        この操作は取り消せません。
      </Text>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={deletionUrl}>
          アカウントを削除する
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
          このリンクの有効期限は <strong>1時間</strong> です。
        </Text>
        <Text style={detailItem}>
          有効期限が切れた場合は、マイページから再度削除をリクエストしてください。
        </Text>
        <Text style={detailItem}>
          <strong>このメールに心当たりがない場合は、無視してください。</strong>
          このリンクをクリックしない限り、アカウントが削除されることはありません。
          第三者が悪用しようとしている可能性がある場合は、
          念のためログイン中のセッションをすべて確認することをお勧めします。
        </Text>
        <Text style={detailItem}>
          このメールに記載されたリンクをクリックする前に、URL
          のドメインが正しいことを
          ご確認ください。当サービスがパスワードや認証情報をメールで尋ねることは
          ありません。
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
      </Text>
      <Text style={urlFallbackText}>{deletionUrl}</Text>
    </EmailLayout>
  );
}

DeleteAccountVerificationEmail.PreviewProps = deleteAccountVerificationFixture;

export default DeleteAccountVerificationEmail;
