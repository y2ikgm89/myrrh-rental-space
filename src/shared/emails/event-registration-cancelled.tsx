import { Hr, Section, Text } from "@react-email/components";
import { eventRegistrationCancelledFixture } from "./event-registration-cancelled.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  heading,
  hr,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  eventTitle: string;
  eventDate: string;
  footer: EmailFooterData;
};

export function EventRegistrationCancelledEmail({
  customerName,
  eventTitle,
  eventDate,
  footer,
}: Props) {
  const danger = SECTION_VARIANT_STYLES.danger;

  return (
    <EmailLayout
      preview={`イベント申込キャンセルのお知らせ - ${eventTitle}`}
      footer={footer}
    >
      <Text style={heading}>イベント申込キャンセルのお知らせ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>以下のイベント申込がキャンセルされました。</Text>

      <Section
        style={{
          backgroundColor: danger.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: danger.heading }}>
          キャンセルされた申込
        </Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {eventDate}
        </Text>
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        参加費の払い戻し条件についてはキャンセルポリシーをご確認ください。
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>

      <Text style={text}>またのご参加を心よりお待ちしております。</Text>
    </EmailLayout>
  );
}

EventRegistrationCancelledEmail.PreviewProps =
  eventRegistrationCancelledFixture;

export default EventRegistrationCancelledEmail;
