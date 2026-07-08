import { Hr, Link, Section, Text } from "@react-email/components";
import { eventReminderFixture } from "./event-reminder.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  eventTitle: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  quantity: number;
  /** ゲスト向け: マイページに申込を追加する claim リンク（会員は表示しない） */
  claimUrl?: string;
  footer: EmailFooterData;
};

export function EventReminderEmail({
  customerName,
  eventTitle,
  eventDate,
  startTime,
  endTime,
  location,
  quantity,
  claimUrl,
  footer,
}: Props) {
  return (
    <EmailLayout
      preview={`明日のイベントリマインダー: ${eventTitle}`}
      footer={footer}
    >
      <Text style={heading}>イベント前日リマインダー</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        明日開催のイベントについてお知らせいたします。当日は時間に余裕をもってお越しください。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>イベント内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日時:</strong> {eventDate} {startTime} - {endTime}
        </Text>
        {location && (
          <Text style={detailItem}>
            <strong>会場:</strong> {location}
          </Text>
        )}
        <Text style={detailItem}>
          <strong>参加人数:</strong> {String(quantity)}名
        </Text>
      </Section>

      {claimUrl && (
        <Section
          style={{
            backgroundColor: SECTION_VARIANT_STYLES.info.background,
            borderRadius: "8px",
            padding: "16px 20px",
            margin: "24px 0",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              color: COLOR.textMuted,
              marginBottom: "8px",
            }}
          >
            Google または LINE でログインすると、この申込をマイページに追加して
            まとめて管理できます。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link
              href={claimUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              マイページに追加する
            </Link>
          </Text>
        </Section>
      )}

      <Hr style={hr} />

      <Text style={text}>
        申込のキャンセル・人数変更をご希望の場合は、お問い合わせ窓口までご連絡
        ください。
      </Text>

      <Text style={text}>当日のご参加を心よりお待ちしております。</Text>
    </EmailLayout>
  );
}

EventReminderEmail.PreviewProps = eventReminderFixture;

export default EventReminderEmail;
