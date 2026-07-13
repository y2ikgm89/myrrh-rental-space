import { Hr, Link, Section, Text } from "@react-email/components";
import { eventWaitlistRegisteredFixture } from "./event-waitlist-registered.fixture";
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
  quantity: number;
  ticketName: string;
  /** FIFO キューにおける現在の順番（1 = 次に繰り上がる） */
  position: number;
  /** 会員向け: ログイン後のマイページ申込一覧 URL */
  memberEventRegistrationUrl?: string;
  /** ゲスト向け: マイページに申込を追加する claim リンク（会員は表示しない） */
  claimUrl?: string;
  footer: EmailFooterData;
};

export function EventWaitlistRegisteredEmail({
  customerName,
  eventTitle,
  eventDate,
  startTime,
  endTime,
  quantity,
  ticketName,
  position,
  memberEventRegistrationUrl,
  claimUrl,
  footer,
}: Props) {
  return (
    <EmailLayout
      preview={`キャンセル待ちに登録しました - ${eventTitle}`}
      footer={footer}
    >
      <Text style={heading}>キャンセル待ちのご登録</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        あいにく満員のため、以下のイベントのキャンセル待ちに登録いたしました。
        他のお客様のキャンセル等で空きが出次第、繰り上げ当選のご案内メールを
        お送りいたします。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お申込み内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {eventDate}
        </Text>
        <Text style={detailItem}>
          <strong>時間:</strong> {startTime} - {endTime}
        </Text>
        <Text style={detailItem}>
          <strong>チケット:</strong> {ticketName}
        </Text>
        <Text style={detailItem}>
          <strong>人数:</strong> {String(quantity)}名
        </Text>
      </Section>

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
            color: SECTION_VARIANT_STYLES.info.heading,
          }}
        >
          現在のお待ち順番: <strong>{position}番目</strong>
        </Text>
      </Section>

      {memberEventRegistrationUrl && (
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
            会員のお客様は、マイページからキャンセル待ちの状況確認・取消が行えます。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link
              href={memberEventRegistrationUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              マイページで確認する
            </Link>
          </Text>
        </Section>
      )}

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
            Google または LINE でログインすると、このお申込みをマイページに
            追加してまとめて管理できます。
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
        繰り上げ当選のご案内メールが届きましたら、記載の期限内にお手続きを
        お願いいたします。ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
}

EventWaitlistRegisteredEmail.PreviewProps = eventWaitlistRegisteredFixture;

export default EventWaitlistRegisteredEmail;
