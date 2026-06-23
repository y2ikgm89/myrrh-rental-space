import { Hr, Section, Text } from "@react-email/components";
import { eventUpdatedNotificationFixture } from "./event-updated-notification.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
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
  newEventDate: string;
  location: string | undefined;
  footer: EmailFooterData;
};

export function EventUpdatedNotificationEmail({
  customerName,
  eventTitle,
  eventDate,
  newEventDate,
  location,
  footer,
}: Props) {
  const warning = SECTION_VARIANT_STYLES.warning;

  return (
    <EmailLayout
      preview={`イベント内容変更のお知らせ - ${eventTitle}`}
      footer={footer}
    >
      <Text style={{ ...heading, color: COLOR.warningHeading }}>
        イベント内容が変更されました
      </Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        お申し込みいただいたイベントの内容が変更されましたのでお知らせいたします。
      </Text>

      <Section
        style={{
          backgroundColor: warning.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: warning.heading }}>
          変更内容
        </Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>変更前の日時:</strong> {eventDate}
        </Text>
        <Text style={detailItem}>
          <strong>変更後の日時:</strong> {newEventDate}
        </Text>
        {location && (
          <Text style={detailItem}>
            <strong>場所:</strong> {location}
          </Text>
        )}
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        変更後の日時でのご参加が難しい場合は、お問い合わせ窓口までご連絡ください。
      </Text>

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
        引き続きよろしくお願いいたします。
      </Text>
    </EmailLayout>
  );
}

EventUpdatedNotificationEmail.PreviewProps = eventUpdatedNotificationFixture;

export default EventUpdatedNotificationEmail;
