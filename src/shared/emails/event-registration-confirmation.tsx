import { Hr, Link, Section, Text } from "@react-email/components";
import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { eventRegistrationConfirmationFixture } from "./event-registration-confirmation.fixture";
import { CalendarLinks } from "./_shared/CalendarLinks";
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
  linkDangerStyle,
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
  registrationId: string;
  addToCalendarLinks?: AddToCalendarUrls;
  /** 会員向け: ログイン後のマイページ申込一覧 URL（キャンセル・確認が可能） */
  memberEventRegistrationUrl?: string;
  /** ゲスト向け: マイページに申込を追加する claim リンク（会員は表示しない） */
  claimUrl?: string;
  /** ゲスト向け: 期限内のみ生成される暗号化トークン付きキャンセル URL */
  cancelUrl?: string;
  footer: EmailFooterData;
};

export function EventRegistrationConfirmationEmail({
  customerName,
  eventTitle,
  eventDate,
  startTime,
  endTime,
  location,
  quantity,
  registrationId,
  addToCalendarLinks,
  memberEventRegistrationUrl,
  claimUrl,
  cancelUrl,
  footer,
}: Props) {
  const danger = SECTION_VARIANT_STYLES.danger;
  return (
    <EmailLayout
      preview={`イベント申込ありがとうございます - ${eventTitle}`}
      footer={footer}
    >
      <Text style={heading}>イベント申込確認</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        この度はイベントにお申込みいただき、誠にありがとうございます。
        以下の内容でお申込みを承りました。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>申込詳細</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>申込番号:</strong> {registrationId}
        </Text>
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {eventDate}
        </Text>
        <Text style={detailItem}>
          <strong>時間:</strong> {startTime} - {endTime}
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

      {addToCalendarLinks && <CalendarLinks links={addToCalendarLinks} />}

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
            会員のお客様は、マイページから申込内容の確認・キャンセルが行えます。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link
              href={memberEventRegistrationUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              マイページで申込を確認する
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

      {cancelUrl && (
        <Section
          style={{
            backgroundColor: danger.background,
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
            お申込みのキャンセルは下記のリンクから行えます（イベント開始前まで有効）。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link href={cancelUrl} style={linkDangerStyle}>
              申込をキャンセルする
            </Link>
          </Text>
        </Section>
      )}

      <Hr style={hr} />

      <Text style={text}>
        人数変更をご希望の場合や、上記リンクがご利用いただけない場合は、
        お問い合わせ窓口までご連絡ください。
      </Text>

      <Text style={text}>当日のご参加を心よりお待ちしております。</Text>
    </EmailLayout>
  );
}

EventRegistrationConfirmationEmail.PreviewProps =
  eventRegistrationConfirmationFixture;

export default EventRegistrationConfirmationEmail;
