import { Button, Hr, Link, Section, Text } from "@react-email/components";
import { eventRegistrationUpdatedFixture } from "./event-registration-updated.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  SECTION_VARIANT_STYLES,
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
  customerName: string;
  eventTitle: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  ticketName: string;
  quantity: number;
  totalPrice: string;
  registrationId: string;
  /** 申込詳細ハブ（会員 mypage / ゲスト status）。再確認の SSoT。 */
  eventRegistrationHubUrl: string;
  footer: EmailFooterData;
};

export function EventRegistrationUpdatedEmail({
  customerName,
  eventTitle,
  eventDate,
  startTime,
  endTime,
  ticketName,
  quantity,
  totalPrice,
  registrationId,
  eventRegistrationHubUrl,
  footer,
}: Props) {
  const info = SECTION_VARIANT_STYLES.info;

  return (
    <EmailLayout
      preview={`イベント申込内容が更新されました - ${eventTitle}`}
      footer={footer}
    >
      <Text style={heading}>イベント申込内容の更新</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        イベントのお申込み内容が更新されました。以下の内容をご確認ください。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>更新後の申込内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日時:</strong> {eventDate} {startTime} - {endTime}
        </Text>
        <Text style={detailItem}>
          <strong>チケット:</strong> {ticketName}
        </Text>
        <Text style={detailItem}>
          <strong>参加人数:</strong> {quantity}名
        </Text>
        <Text style={detailItem}>
          <strong>合計金額:</strong> {totalPrice}
        </Text>
        <Text style={detailItem}>
          <strong>申込ID:</strong> {registrationId.slice(0, 8).toUpperCase()}
        </Text>
      </Section>

      <Section
        style={{
          backgroundColor: info.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...text, margin: "0 0 12px 0" }}>
          日時・チケット種別の変更は、一度キャンセルしてから再度お申込みください。
        </Text>
      </Section>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={eventRegistrationHubUrl}>
          申込詳細を確認する
        </Button>
      </Section>

      <Text style={urlFallbackText}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
        <br />
        <Link href={eventRegistrationHubUrl} style={linkStyle}>
          {eventRegistrationHubUrl}
        </Link>
      </Text>

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
}

EventRegistrationUpdatedEmail.PreviewProps = eventRegistrationUpdatedFixture;

export default EventRegistrationUpdatedEmail;
