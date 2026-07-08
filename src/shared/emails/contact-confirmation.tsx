import { Hr, Link, Section, Text } from "@react-email/components";
import { contactConfirmationFixture } from "./contact-confirmation.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  messageText,
  text,
} from "./_shared/styles";

type Props = {
  name: string;
  subject: string;
  message: string;
  /** 会員向け: ログイン後のマイページ問い合わせ詳細 URL */
  memberInquiryUrl?: string;
  footer: EmailFooterData;
};

export function ContactConfirmationEmail({
  name,
  subject,
  message,
  memberInquiryUrl,
  footer,
}: Props) {
  return (
    <EmailLayout preview="お問い合わせを受け付けました" footer={footer}>
      <Text style={heading}>お問い合わせありがとうございます</Text>

      <Text style={text}>{name} 様</Text>

      <Text style={text}>
        お問い合わせいただき、誠にありがとうございます。
        以下の内容でお問い合わせを受け付けました。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お問い合わせ内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>件名:</strong> {subject}
        </Text>
        <Text style={detailItem}>
          <strong>内容:</strong>
        </Text>
        <Text
          style={{
            ...messageText,
            backgroundColor: COLOR.surface,
            padding: "12px",
            borderRadius: "4px",
            border: `1px solid ${COLOR.border}`,
          }}
        >
          {message}
        </Text>
      </Section>

      {memberInquiryUrl && (
        <Text style={text}>
          <Link
            href={memberInquiryUrl}
            style={{ color: COLOR.link, textDecoration: "underline" }}
          >
            マイページでお問い合わせを確認する
          </Link>
        </Text>
      )}

      <Hr style={hr} />

      <Text style={text}>
        担当者より 2〜3 営業日以内にご連絡いたします。
        今しばらくお待ちくださいますようお願い申し上げます。
      </Text>

      <Text style={text}>
        お問い合わせ内容に関する個人情報は、当サービスのプライバシーポリシーに
        基づき、お問い合わせ対応の目的にのみ利用いたします。
      </Text>
    </EmailLayout>
  );
}

ContactConfirmationEmail.PreviewProps = contactConfirmationFixture;

export default ContactConfirmationEmail;
