import { Button, Hr, Section, Text } from "@react-email/components";
import { eventWaitlistOfferedFixture } from "./event-waitlist-offered.fixture";
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
  text,
  urlFallbackText,
} from "./_shared/styles";

type Props = {
  customerName: string;
  eventTitle: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  quantity: number;
  /** 有効期限（JST 日付・曜日付き）例: "2026年7月21日(火)" */
  expiresAtDate: string;
  /** 有効期限の時刻（JST "HH:mm"） */
  expiresAtTime: string;
  /** 無料イベントは confirmUrl、有料イベントは Stripe Checkout への checkoutUrl */
  actionUrl: string;
  isPaid: boolean;
  /** isPaid のときのみ渡される、フォーマット済み金額（例: "¥3,000"） */
  priceDisplay?: string;
  footer: EmailFooterData;
};

export function EventWaitlistOfferedEmail({
  customerName,
  eventTitle,
  eventDate,
  startTime,
  endTime,
  quantity,
  expiresAtDate,
  expiresAtTime,
  actionUrl,
  isPaid,
  priceDisplay,
  footer,
}: Props) {
  const warning = SECTION_VARIANT_STYLES.warning;

  return (
    <EmailLayout
      preview={`繰り上げ当選のお知らせ - ${eventTitle}`}
      footer={footer}
    >
      <Text style={heading}>繰り上げ当選のお知らせ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        お待たせいたしました。キャンセルにより空きが出たため、
        キャンセル待ちにご登録いただいていた以下のイベントにご参加いただけることに
        なりました。
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
          お手続き期限
        </Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>
            {expiresAtDate} {expiresAtTime} まで
          </strong>
          にお手続きください。
        </Text>
        <Text style={detailItem}>
          期限を過ぎますと自動的にキャンセル扱いとなり、次にお待ちのお客様に
          権利が移りますのでご注意ください。
        </Text>
      </Section>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>イベント内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日時:</strong> {eventDate} {startTime} - {endTime}
        </Text>
        <Text style={detailItem}>
          <strong>人数:</strong> {String(quantity)}名
        </Text>
        {isPaid && priceDisplay && (
          <Text style={detailItem}>
            <strong>お支払い金額:</strong> {priceDisplay}
          </Text>
        )}
      </Section>

      <Section style={buttonSection}>
        <Button style={buttonPrimary} href={actionUrl}>
          {isPaid ? "支払い手続きに進む" : "参加を確定する"}
        </Button>
      </Section>

      <Text style={text}>
        ボタンが機能しない場合は、以下の URL をブラウザに貼り付けてください:
      </Text>
      <Text style={urlFallbackText}>{actionUrl}</Text>

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
        当日のご参加を心よりお待ちしております。
      </Text>
    </EmailLayout>
  );
}

EventWaitlistOfferedEmail.PreviewProps = eventWaitlistOfferedFixture;

export default EventWaitlistOfferedEmail;
