import { Link, Section, Text } from "@react-email/components";
import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { COLOR, SECTION_VARIANT_STYLES } from "./styles";

interface Props {
  links: AddToCalendarUrls;
}

export function CalendarLinks({ links }: Props) {
  const variant = SECTION_VARIANT_STYLES.info;
  return (
    <Section
      style={{
        backgroundColor: variant.background,
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "24px 0",
      }}
    >
      <Text
        style={{
          fontSize: "16px",
          fontWeight: "600",
          color: variant.heading,
          marginBottom: "8px",
        }}
      >
        カレンダーに追加
      </Text>
      <Text
        style={{
          fontSize: "14px",
          color: COLOR.textMuted,
          marginBottom: "12px",
        }}
      >
        この予定をカレンダーに追加できます:
      </Text>
      <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
        <Link
          href={links.google}
          style={{ color: COLOR.link, textDecoration: "underline" }}
        >
          Google Calendar
        </Link>
        {" | "}
        <Link
          href={links.outlookWeb}
          style={{ color: COLOR.link, textDecoration: "underline" }}
        >
          Outlook
        </Link>
        {" | "}
        <Link
          href={links.ics}
          style={{ color: COLOR.link, textDecoration: "underline" }}
        >
          iCal (.ics)
        </Link>
      </Text>
    </Section>
  );
}
