import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { RESERVATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";

type StatusBadgeColors = {
  color: string;
  backgroundColor: string;
};

const STATUS_BADGE_COLORS: Record<string, StatusBadgeColors> = {
  CONFIRMED: { color: "#ffffff", backgroundColor: "#22c55e" },
  COMPLETED: { color: "#ffffff", backgroundColor: "#3b82f6" },
  CANCELLED: { color: "#ffffff", backgroundColor: "#ef4444" },
  NO_SHOW: { color: "#ffffff", backgroundColor: "#f97316" },
  PENDING: { color: "#1a1a1a", backgroundColor: "#eab308" },
};

const DEFAULT_BADGE_COLORS: StatusBadgeColors = {
  color: "#ffffff",
  backgroundColor: "#6b7280",
};

type AddToCalendarLinks = {
  google: string;
  outlookWeb: string;
  ics: string;
};

type ReservationStatusChangedEmailProps = {
  customerName: string;
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  reservationId: string;
  newStatus: string;
  location?: string;
  addToCalendarLinks?: AddToCalendarLinks;
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
}: ReservationStatusChangedEmailProps) {
  const badgeColors = STATUS_BADGE_COLORS[newStatus] ?? DEFAULT_BADGE_COLORS;
  const statusLabel = isValidReservationStatus(newStatus)
    ? RESERVATION_STATUS_LABELS[newStatus]
    : newStatus;

  return (
    <Html>
      <Head />
      <Preview>予約ステータス更新のお知らせ - {spaceName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>予約ステータス更新のお知らせ</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>
            ご予約のステータスが更新されましたのでお知らせいたします。
          </Text>

          <Section style={statusSection}>
            <Text style={statusLabel_style}>新しいステータス</Text>
            <Text
              style={{
                ...statusBadge,
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

          {addToCalendarLinks && (
            <Section style={calendarSection}>
              <Text style={calendarHeading}>カレンダーに追加</Text>
              <Text style={calendarDescription}>
                この予約をカレンダーに追加できます:
              </Text>
              <Text style={calendarLinks}>
                <Link href={addToCalendarLinks.google} style={calendarLink}>
                  Google Calendar
                </Link>
                {" | "}
                <Link href={addToCalendarLinks.outlookWeb} style={calendarLink}>
                  Outlook
                </Link>
                {" | "}
                <Link href={addToCalendarLinks.ics} style={calendarLink}>
                  iCal (.ics)
                </Link>
              </Text>
            </Section>
          )}

          <Hr style={hr} />

          <Text style={text}>
            ご不明な点がございましたら、お気軽にお問い合わせください。
          </Text>

          <Text style={footer}>Myrrh Rental Space</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
};

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "24px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
};

const statusSection = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const statusLabel_style = {
  fontSize: "14px",
  color: "#8898aa",
  marginBottom: "8px",
};

const statusBadge = {
  display: "inline-block",
  fontSize: "18px",
  fontWeight: "700",
  padding: "10px 24px",
  borderRadius: "8px",
  margin: "0 auto",
};

const detailsSection = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "12px",
};

const detailItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#484848",
  margin: "8px 0",
};

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

const calendarSection = {
  backgroundColor: "#e8f4fd",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0",
};

const calendarHeading = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "8px",
};

const calendarDescription = {
  fontSize: "14px",
  color: "#484848",
  marginBottom: "12px",
};

const calendarLinks = {
  fontSize: "14px",
  lineHeight: "24px",
};

const calendarLink = {
  color: "#0066cc",
  textDecoration: "underline",
};

export default ReservationStatusChangedEmail;
