import { Button, Hr, Section, Text } from "@react-email/components";
import { customerMergeVerificationFixture } from "./customer-merge-verification.fixture";
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
  guestEmail: string;
  verificationUrl: string;
  reservationCount: number;
  inquiryCount: number;
  reviewCount: number;
  registrationCount: number;
  siteName: string;
  footer: EmailFooterData;
};

function formatCountLine(label: string, count: number): string {
  return `${label}: ${count.toString()} 件`;
}

export function CustomerMergeVerificationEmail({
  name,
  guestEmail,
  verificationUrl,
  reservationCount,
  inquiryCount,
  reviewCount,
  registrationCount,
  siteName,
  footer,
}: Props) {
  const warning = SECTION_VARIANT_STYLES.warning;

  return (
    <EmailLayout preview={`履歴統合の確認 - ${siteName}`} footer={footer}>
      <Text style={heading}>マイページへの履歴統合</Text>

      <Text style={text}>{name} 様</Text>

      <Text style={text}>
        このメールアドレス（{guestEmail}
        ）で、ログイン前に作成された予約・お問い合わせ等の履歴を、現在の
        マイページアカウントへ統合するリクエストを受け付けました。
        ご本人の操作であることを確認するため、下のボタンをクリックしてください。
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
          統合対象の履歴（概算）
        </Text>
        <Text style={detailItem}>
          {formatCountLine("予約", reservationCount)}
        </Text>
        <Text style={detailItem}>
          {formatCountLine("お問い合わせ", inquiryCount)}
        </Text>
        <Text style={detailItem}>
          {formatCountLine("レビュー", reviewCount)}
        </Text>
        <Text style={detailItem}>
          {formatCountLine("イベント参加", registrationCount)}
        </Text>
      </Section>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={verificationUrl}>
          履歴統合を確認する
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
          有効期限が切れた場合は、マイページから再度統合をリクエストしてください。
        </Text>
        <Text style={detailItem}>
          <strong>このメールに心当たりがない場合は、無視してください。</strong>
          第三者があなたのメールアドレス宛に統合リクエストを送った可能性があります。
          リンクをクリックしない限り、履歴の統合は行われません。
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

CustomerMergeVerificationEmail.PreviewProps = customerMergeVerificationFixture;

export default CustomerMergeVerificationEmail;
