import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type StatusBadgeStyle = {
  label: string;
  color: string;
  backgroundColor: string;
};

const STATUS_BADGE_MAP: Record<string, StatusBadgeStyle> = {
  CONFIRMED: {
    label: "確認済み",
    color: "#ffffff",
    backgroundColor: "#22c55e",
  },
  COMPLETED: {
    label: "完了",
    color: "#ffffff",
    backgroundColor: "#3b82f6",
  },
  CANCELLED: {
    label: "キャンセル",
    color: "#ffffff",
    backgroundColor: "#ef4444",
  },
  NO_SHOW: {
    label: "ノーショー",
    color: "#ffffff",
    backgroundColor: "#f97316",
  },
  PENDING: {
    label: "保留中",
    color: "#1a1a1a",
    backgroundColor: "#eab308",
  },
};

const DEFAULT_BADGE: StatusBadgeStyle = {
  label: "",
  color: "#ffffff",
  backgroundColor: "#6b7280",
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
}: ReservationStatusChangedEmailProps) {
  const badge = STATUS_BADGE_MAP[newStatus] ?? DEFAULT_BADGE;
  const statusLabel = badge.label || newStatus;

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
                color: badge.color,
                backgroundColor: badge.backgroundColor,
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

export default ReservationStatusChangedEmail;
