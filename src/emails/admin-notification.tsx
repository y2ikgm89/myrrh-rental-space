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
} from '@react-email/components'

type ReservationNotificationProps = {
  type: 'reservation'
  action: 'new' | 'update' | 'cancel'
  customerName: string
  customerEmail: string
  spaceName: string
  reservationDate: string
  startTime: string
  endTime: string
  totalPrice: string
  reservationId: string
  adminUrl: string
}

type InquiryNotificationProps = {
  type: 'inquiry'
  name: string
  email: string
  subject: string
  message: string
  inquiryId: string
  adminUrl: string
}

type Props = ReservationNotificationProps | InquiryNotificationProps

export function AdminNotificationEmail(props: Props) {
  if (props.type === 'inquiry') {
    return <InquiryNotification {...props} />
  }
  return <ReservationNotification {...props} />
}

function ReservationNotification({
  action,
  customerName,
  customerEmail,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  totalPrice,
  reservationId,
  adminUrl,
}: ReservationNotificationProps) {
  const actionText = {
    new: '新規予約',
    update: '予約変更',
    cancel: '予約キャンセル',
  }[action]

  const actionColor = {
    new: '#16a34a',
    update: '#ca8a04',
    cancel: '#dc2626',
  }[action]

  return (
    <Html>
      <Head />
      <Preview>[{actionText}] {spaceName} - {customerName}様</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={{ ...heading, color: actionColor }}>
            {actionText}のお知らせ
          </Heading>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>予約情報</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>予約番号:</strong> {reservationId}
            </Text>
            <Text style={detailItem}>
              <strong>お客様:</strong> {customerName} ({customerEmail})
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
            <Text style={detailItem}>
              <strong>料金:</strong> {totalPrice}
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Link href={adminUrl} style={button}>
              管理画面で確認
            </Link>
          </Section>

          <Text style={footer}>
            Myrrh Rental Space 管理システム
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function InquiryNotification({
  name,
  email,
  subject,
  message,
  inquiryId,
  adminUrl,
}: InquiryNotificationProps) {
  return (
    <Html>
      <Head />
      <Preview>[新規お問い合わせ] {subject} - {name}様</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={{ ...heading, color: '#2563eb' }}>
            新規お問い合わせ
          </Heading>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>お問い合わせ情報</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>ID:</strong> {inquiryId}
            </Text>
            <Text style={detailItem}>
              <strong>お名前:</strong> {name}
            </Text>
            <Text style={detailItem}>
              <strong>メール:</strong> {email}
            </Text>
            <Text style={detailItem}>
              <strong>件名:</strong> {subject}
            </Text>
            <Text style={detailItem}>
              <strong>内容:</strong>
            </Text>
            <Text style={messageText}>
              {message}
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Link href={adminUrl} style={button}>
              管理画面で確認
            </Link>
          </Section>

          <Text style={footer}>
            Myrrh Rental Space 管理システム
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
}

const heading = {
  fontSize: '24px',
  fontWeight: '600',
  marginBottom: '24px',
}

const detailsSection = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
}

const detailsHeading = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1a1a1a',
  marginBottom: '12px',
}

const detailItem = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#484848',
  margin: '8px 0',
}

const messageText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#484848',
  whiteSpace: 'pre-wrap',
  backgroundColor: '#ffffff',
  padding: '12px',
  borderRadius: '4px',
  border: '1px solid #e6e6e6',
}

const hr = {
  borderColor: '#e6e6e6',
  margin: '16px 0',
}

const buttonSection: React.CSSProperties = {
  textAlign: 'center',
  margin: '24px 0',
}

const button = {
  backgroundColor: '#1a1a1a',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}

const footer = {
  fontSize: '12px',
  color: '#8898aa',
  marginTop: '32px',
}

export default AdminNotificationEmail
