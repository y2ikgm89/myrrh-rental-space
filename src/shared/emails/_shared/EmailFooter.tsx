import { Hr, Link, Section, Text } from "@react-email/components";
import type { EmailFooterData } from "./footer-data";
import { footerLink, footerLinks, footerText, footerWrap, hr } from "./styles";

interface Props {
  data: EmailFooterData;
}

export function EmailFooter({ data }: Props) {
  const {
    businessName,
    address,
    phoneNumber,
    contactEmail,
    siteUrl,
    siteName,
    legalLinks,
  } = data;

  return (
    <Section style={footerWrap}>
      <Hr style={hr} />

      <Text style={{ ...footerText, fontWeight: 600 }}>{businessName}</Text>

      {address.length > 0 && <Text style={footerText}>{address}</Text>}

      {(phoneNumber || contactEmail) && (
        <Text style={footerText}>
          {phoneNumber && <>TEL: {phoneNumber}</>}
          {phoneNumber && contactEmail && <>　</>}
          {contactEmail && (
            <>
              Email:{" "}
              <Link href={`mailto:${contactEmail}`} style={footerLink}>
                {contactEmail}
              </Link>
            </>
          )}
        </Text>
      )}

      {legalLinks.length > 0 && (
        <Text style={footerLinks}>
          {legalLinks.map((link, i) => (
            <span key={link.href}>
              {i > 0 && <>　|　</>}
              <Link href={link.href} style={footerLink}>
                {link.label}
              </Link>
            </span>
          ))}
        </Text>
      )}

      <Text style={footerText}>
        本メールは送信専用です。返信は{" "}
        {contactEmail ? (
          <Link href={`mailto:${contactEmail}`} style={footerLink}>
            {contactEmail}
          </Link>
        ) : (
          "お問い合わせ窓口"
        )}{" "}
        までお願いいたします。
      </Text>

      <Text style={{ ...footerText, marginTop: "12px" }}>
        ©{" "}
        {siteUrl ? (
          <Link href={siteUrl} style={footerLink}>
            {siteName}
          </Link>
        ) : (
          siteName
        )}
      </Text>
    </Section>
  );
}
