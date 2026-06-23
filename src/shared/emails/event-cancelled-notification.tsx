import { Hr, Section, Text } from "@react-email/components";
import { eventCancelledNotificationFixture } from "./event-cancelled-notification.fixture";
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
  /** 中止の理由（管理者が任意で記入。空文字または undefined なら本文非表示） */
  reason?: string;
  footer: EmailFooterData;
};

export function EventCancelledNotificationEmail({
  customerName,
  eventTitle,
  eventDate,
  reason,
  footer,
}: Props) {
  const danger = SECTION_VARIANT_STYLES.danger;

  return (
    <EmailLayout
      preview={`イベント中止のお知らせ - ${eventTitle}`}
      footer={footer}
    >
      <Text style={{ ...heading, color: COLOR.danger }}>
        イベント中止のお知らせ
      </Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        誠に申し訳ございませんが、お申し込みいただいた以下のイベントが
        中止となりました。
      </Text>

      <Section
        style={{
          backgroundColor: danger.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: danger.heading }}>
          中止となったイベント
        </Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>開催予定日:</strong> {eventDate}
        </Text>
        {reason && reason.length > 0 && (
          <Text style={detailItem}>
            <strong>中止理由:</strong> {reason}
          </Text>
        )}
      </Section>

      <Hr style={hr} />

      <Text style={text}>
        お支払い済みの参加費がある場合は、キャンセルポリシーに従い払い戻しの
        ご案内をいたします。お手続きの詳細につきましては、別途ご連絡いたします。
      </Text>

      <Text style={text}>
        ご不便・ご迷惑をおかけして誠に申し訳ございません。
        またの機会のご参加を心よりお待ちしております。
      </Text>
    </EmailLayout>
  );
}

EventCancelledNotificationEmail.PreviewProps =
  eventCancelledNotificationFixture;

export default EventCancelledNotificationEmail;
