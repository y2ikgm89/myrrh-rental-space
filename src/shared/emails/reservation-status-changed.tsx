import { Hr, Link, Section, Text } from "@react-email/components";
import { RESERVATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { reservationStatusChangedFixture } from "./reservation-status-changed.fixture";
import { CalendarLinks } from "./_shared/CalendarLinks";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  text,
} from "./_shared/styles";

type StatusBadgeColors = {
  color: string;
  backgroundColor: string;
};

/** WCAG AA: ステータスバッジは白文字 + 暗色背景、または濃灰文字 + 明色背景で対比 4.5:1 以上を確保。 */
const STATUS_BADGE_COLORS: Record<string, StatusBadgeColors> = {
  CONFIRMED: { color: "#ffffff", backgroundColor: "#15803d" },
  COMPLETED: { color: "#ffffff", backgroundColor: "#1d4ed8" },
  CANCELLED: { color: "#ffffff", backgroundColor: "#b91c1c" },
  NO_SHOW: { color: "#ffffff", backgroundColor: "#c2410c" },
  PENDING: { color: "#1f2937", backgroundColor: "#fde68a" },
};

const DEFAULT_BADGE_COLORS: StatusBadgeColors = {
  color: "#ffffff",
  backgroundColor: "#374151",
};

type Props = {
  customerName: string;
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  reservationId: string;
  newStatus: string;
  location?: string;
  addToCalendarLinks?: AddToCalendarUrls;
  memberReservationUrl?: string;
  footer: EmailFooterData;
};

export function ReservationStatusChangedEmail({
  customerName,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  totalPrice,
  reservationId,
  newStatus,
  location,
  addToCalendarLinks,
  memberReservationUrl,
  footer,
}: Props) {
  const badgeColors = STATUS_BADGE_COLORS[newStatus] ?? DEFAULT_BADGE_COLORS;
  const statusLabel = isValidReservationStatus(newStatus)
    ? RESERVATION_STATUS_LABELS[newStatus]
    : newStatus;

  return (
    <EmailLayout
      preview={`予約ステータス更新のお知らせ - ${spaceName}`}
      footer={footer}
    >
      <Text style={heading}>予約ステータス更新のお知らせ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        ご予約のステータスが更新されましたのでお知らせいたします。
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Text
          style={{
            fontSize: "14px",
            color: COLOR.textSubtle,
            marginBottom: "8px",
          }}
        >
          【{statusLabel}】に更新されました
        </Text>
        <Text
          style={{
            display: "inline-block",
            fontSize: "18px",
            fontWeight: "700",
            padding: "10px 24px",
            borderRadius: "8px",
            margin: "0 auto",
            color: badgeColors.color,
            backgroundColor: badgeColors.backgroundColor,
          }}
        >
          {statusLabel}
        </Text>
      </Section>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>予約詳細</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>予約番号:</strong> {reservationId}
        </Text>
        <Text style={detailItem}>
          <strong>スペース:</strong> {spaceName}
        </Text>
        {location && (
          <Text style={detailItem}>
            <strong>場所:</strong> {location}
          </Text>
        )}
        <Text style={detailItem}>
          <strong>日付:</strong> {reservationDate}
        </Text>
        <Text style={detailItem}>
          <strong>時間:</strong> {startTime} - {endTime}
        </Text>
        <Text style={detailItem}>
          <strong>料金:</strong> {totalPrice}
        </Text>
      </Section>

      {addToCalendarLinks && <CalendarLinks links={addToCalendarLinks} />}

      {memberReservationUrl && (
        <Text style={text}>
          <Link
            href={memberReservationUrl}
            style={{ color: COLOR.link, textDecoration: "underline" }}
          >
            マイページで予約詳細を確認する
          </Link>
        </Text>
      )}

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
}

ReservationStatusChangedEmail.PreviewProps = reservationStatusChangedFixture;

export default ReservationStatusChangedEmail;
