import { Button, Hr, Section, Text } from "@react-email/components";
import { changeEmailVerificationFixture } from "./change-email-verification.fixture";
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
  newEmail: string;
  verificationUrl: string;
  siteName: string;
  footer: EmailFooterData;
};

export function ChangeEmailVerificationEmail({
  name,
  newEmail,
  verificationUrl,
  siteName,
  footer,
}: Props) {
  const warning = SECTION_VARIANT_STYLES.warning;

  return (
    <EmailLayout preview={`メールアドレスの確認 - ${siteName}`} footer={footer}>
      <Text style={heading}>メールアドレスの確認</Text>

      <Text style={text}>{name} 様</Text>

      <Text style={text}>
        マイページにて以下のメールアドレスの登録リクエストを受け付けました。
        本人確認のため、下のボタンをクリックしてご本人の登録であることを
        確認してください。
      </Text>

      <Section
        style={{
          backgroundColor: warning.background,
          borderRadius: "8px",
          padding: "16px",
          margin: "16px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: warning.heading }}>
          登録予定のメールアドレス
        </Text>
        <Text style={detailItem}>
          <strong>{newEmail}</strong>
        </Text>
      </Section>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={verificationUrl}>
          このメールアドレスを登録する
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
          有効期限が切れた場合は、マイページから再度メールアドレスを
          入力してリクエストしてください。
        </Text>
        <Text style={detailItem}>
          <strong>このメールに心当たりがない場合は、無視してください。</strong>
          第三者があなたのメールアドレスを別のアカウントに紐付けようとして
          いる可能性があります。リンクをクリックしない限り、あなたの
          メールアドレスに変更は発生しません。
        </Text>
        <Text style={detailItem}>
          このメールに記載されたリンクをクリックする前に、URL
          のドメインが正しいことをご確認ください。当サービスがパスワードや
          認証情報をメールで尋ねることはありません。
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
      </Text>
      <Text style={urlFallbackText}>{verificationUrl}</Text>
    </EmailLayout>
  );
}

ChangeEmailVerificationEmail.PreviewProps = changeEmailVerificationFixture;

export default ChangeEmailVerificationEmail;
