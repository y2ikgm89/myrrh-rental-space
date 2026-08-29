/** メールアドレスの local part をマスクする (例: `t***@example.com`)。 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return email;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (domain.length === 0) return email;

  const maskedLocal = local.length <= 1 ? "*" : `${local.slice(0, 1)}***`;
  return `${maskedLocal}@${domain}`;
}
