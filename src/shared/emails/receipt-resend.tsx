import { Button, Hr, Link, Section, Text } from "@react-email/components";
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
  /** 宛名（法人名または個人氏名。issueReceiptForReservation と同一 SSoT） */
  recipientName: string;
  /** 但書（「スペース利用料として」等） */
  subject: string;
  /** 発行日（JST 表記の日付文字列） */
  issuedAt: string;
  /** 合計金額（円マーク・カンマ区切り済みの表示用文字列） */
  amount: string;
  /** 現在の領収書番号（Case B/C とも「最新の Receipt」の serialNo） */
  serialNo: string;
  /**
   * 元領収書の serialNo。再発行 (Case C) 時のみ渡す。
   * 未指定 = Case B = 同一 Receipt で新 token 発行の再送
   */
  previousSerialNo?: string;
  /** 24 時間有効な新署名 URL（createReceiptDownloadToken 由来） */
  receiptDownloadUrl: string;
  footer: EmailFooterData;
};

export function ReceiptResendEmail({
  recipientName,
  subject,
  issuedAt,
  amount,
  serialNo,
  previousSerialNo,
  receiptDownloadUrl,
  footer,
}: Props) {
  const isReissued = previousSerialNo !== undefined;
  return (
    <EmailLayout
      preview="領収書のダウンロードリンクを再送信しました"
      footer={footer}
    >
      <Text style={heading}>
        {isReissued
          ? "領収書を再発行しました"
          : "領収書ダウンロードリンクを再送信しました"}
      </Text>

      <Text style={text}>{recipientName} 様</Text>

      <Text style={text}>
        {isReissued
          ? "お申し出により、領収書を訂正版として再発行しました。以下のリンクから 24 時間以内にダウンロードできます。旧領収書（番号: " +
            previousSerialNo +
            "）に代わり本領収書をご利用ください。"
          : "領収書ダウンロードリンクの再送信リクエストを受け付けました。以下のリンクから 24 時間以内にダウンロードできます。"}
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
        <Button href={receiptDownloadUrl} style={buttonPrimary}>
          領収書をダウンロード（PDF）
        </Button>
      </Section>

      <Text style={urlFallbackText}>
        ボタンが動作しない場合は次の URL をブラウザに貼り付けてください:
        <br />
        <Link href={receiptDownloadUrl} style={linkStyle}>
          {receiptDownloadUrl}
        </Link>
      </Text>

      <Hr style={hr} />

      <Text style={text}>
        本リンクの有効期限は発行から 24 時間、1 回のみダウンロード可能です。
        再度リンクが必要な場合はお問い合わせいただくか、再送信フォームからリクエストしてください。
      </Text>

      {isReissued && (
        <Text style={text}>
          旧領収書（番号: {previousSerialNo}
          ）は無効となりました。会計処理には本領収書をご利用ください。
        </Text>
      )}
    </EmailLayout>
  );
}
