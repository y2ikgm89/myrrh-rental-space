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

type Props = {
  customerName: string;
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  reservationId: string;
};

export function ReservationCancelledEmail({
  customerName,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  reservationId,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>予約キャンセルのお知らせ - {spaceName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>予約キャンセルのお知らせ</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>以下のご予約がキャンセルされました。</Text>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>キャンセルされた予約</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>予約番号:</strong> {reservationId}
            </Text>
            <Text style={detailItem}>
              <strong>スペース:</strong> {spaceName}
            </Text>
            <Text style={detailItem}>
              <strong>日付:</strong> {reservationDate}
            </Text>
            <Text style={detailItem}>
              <strong>時間:</strong> {startTime} - {endTime}
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>またのご利用をお待ちしております。</Text>

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

const detailsSection = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#991b1b",
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

export default ReservationCancelledEmail;
