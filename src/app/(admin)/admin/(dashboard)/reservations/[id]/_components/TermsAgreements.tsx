/**
 * 規約同意記録セクション（Server Component）
 *
 * 予約詳細ページに表示する。同意記録がない場合は非表示。
 */

import { DetailSection } from "@/admin/components/DetailSection";

interface TermsAgreement {
  readonly id: string;
  readonly agreedAt: Date;
  readonly ipAddress: string | null;
  readonly terms: { readonly title: string; readonly type: string };
  readonly version: { readonly version: number };
}

interface TermsAgreementsProps {
  readonly agreements: readonly TermsAgreement[];
}

export function TermsAgreements({ agreements }: TermsAgreementsProps) {
  if (agreements.length === 0) return null;

  return (
    <DetailSection title="規約同意記録">
      <div className="space-y-3">
        {agreements.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{a.terms.title}</span>
              <span className="ml-2 text-muted-foreground">
                v{a.version.version}
              </span>
            </div>
            <div className="text-muted-foreground">
              {new Date(a.agreedAt).toLocaleString("ja-JP")}
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
