import { Button, Hr, Link, Section, Text } from "@react-email/components";
import { receiptIssuedFixture } from "./receipt-issued.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  buttonPrimary,
  buttonSection,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  linkStyle,
  text,
  urlFallbackText,
} from "./_shared/styles";

type Props = {
  /** 宛名（法人名または個人氏名） */
  recipientName: string;
  /** 但書（「スペース利用料として」等） */
  subject: string;
  /** 発行日（JST 表記の日付文字列） */
  issuedAt: string;
  /** 合計金額（円マーク・カンマ区切り済みの表示用文字列） */
  amount: string;
  /** 領収書番号（「YYYY-XXXXXX」形式） */
  serialNo: string;
  /**
   * 詳細ページ CTA URL。
   * 会員は mypage、ゲストは status token URL 等を呼出側が組み立てて渡す。
   * PDF API 直リンクは表導線にしない。
   */
  detailUrl: string;
  footer: EmailFooterData;
};

/**
 * 領収書の新規発行通知メール（ゲスト・会員共通）。
 * 再送信 (`receipt-resend`) とは別テンプレ。CTA は予約/申込詳細へ誘導する。
 */
export function ReceiptIssuedEmail({
  recipientName,
  subject,
  issuedAt,
  amount,
  serialNo,
  detailUrl,
  footer,
}: Props) {
  return (
    <EmailLayout preview="領収書を発行しました" footer={footer}>
      <Text style={heading}>領収書を発行しました</Text>

      <Text style={text}>{recipientName} 様</Text>

      <Text style={text}>
        お支払いの確認が完了し、領収書を発行しました。
        以下の詳細ページから領収書 PDF をダウンロードできます。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>領収書情報</Text>
        <Text style={detailItem}>領収書番号: {serialNo}</Text>
        <Text style={detailItem}>宛名: {recipientName}</Text>
        <Text style={detailItem}>但書: {subject}</Text>
        <Text style={detailItem}>金額: {amount}</Text>
        <Text style={detailItem}>発行日: {issuedAt}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={detailUrl} style={buttonPrimary}>
          詳細を確認する
        </Button>
      </Section>

      <Text style={urlFallbackText}>
        ボタンが動作しない場合は次の URL をブラウザに貼り付けてください:
        <br />
        <Link href={detailUrl} style={linkStyle}>
          {detailUrl}
        </Link>
      </Text>

      <Hr style={hr} />

      <Text style={text}>
        本メールは領収書発行時の自動通知です。リンクの再送が必要な場合は、再送信フォームまたはお問い合わせをご利用ください。
      </Text>
    </EmailLayout>
  );
}

ReceiptIssuedEmail.PreviewProps = receiptIssuedFixture;

export default ReceiptIssuedEmail;
