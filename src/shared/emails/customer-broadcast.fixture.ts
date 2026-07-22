import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { CustomerBroadcastEmail } from "./customer-broadcast";

export const customerBroadcastFixture = {
  subject: "【お知らせ】年末年始の営業について",
  bodyText:
    "いつもご利用いただきありがとうございます。\n\n誠に勝手ながら、年末年始（12/29〜1/3）は休業とさせていただきます。\n1/4より通常営業を再開いたします。\n\nご不便をおかけしますが、何卒よろしくお願いいたします。",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof CustomerBroadcastEmail>[0];
