import { IconMapPin } from "@tabler/icons-react";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { parseFacilities } from "@/shared/lib/json-validators";

interface SpaceInfoProps {
  readonly space: {
    readonly name: string;
    readonly descriptionHtml: string;
    /** 拠点住所 + 所在地補足の1行 */
    readonly lineAddress: string;
    /** Prisma Json（{ name, iconName }[] 形式 — `parseFacilities` で防御的型ガード） */
    readonly facilities: unknown;
    /**
     * 親 Location（accessLines / parkingInfo は Booking.com Room → Property の
     * 業界標準パターンに沿って Space 詳細から表示する）。
     */
    readonly location: {
      readonly name: string;
      readonly accessLines: readonly string[];
      readonly parkingInfo: string | null;
    } | null;
  };
}

/**
 * SpaceInfo — Variant E (Editorial Magazine brand) 適用済の本文 body。
 *
 * - About: serif body + 余白 (drop-cap なし、全段落同一スタイル)
 * - Amenities: 中央寄せ editorial grid (font-sans / Noto Sans JP 統一)
 * - Access: editorial list (font-sans / Noto Sans JP 統一) + italic 駐車場注記
 *
 * Lead 段落 / Pull-quote / Reviews は page.tsx 側で構築 (この component の責務外)。
 */
export function SpaceInfo({ space }: SpaceInfoProps) {
  const facilities = parseFacilities(space.facilities);

  return (
    <div className="space-y-16">
      {/* About: flat description (drop-cap なし) */}
      {space.descriptionHtml ? (
        <section>
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — About this space —
          </p>
          <h2 className="mt-4 font-heading text-2xl font-light md:text-3xl">
            このスペースについて
          </h2>
          <div className="mt-8 [&_p]:text-base [&_p]:leading-[2] [&_p]:text-foreground [&_p+p]:mt-6">
            <SanitizedHtml html={space.descriptionHtml} />
          </div>
        </section>
      ) : null}

      {/* Amenities: 中央寄せ editorial grid */}
      {facilities.length > 0 ? (
        <section className="border-y border-divider py-12">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — Amenities —
          </p>
          <h2 className="mt-4 font-heading text-2xl font-light md:text-3xl">
            設備
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-y-3 text-base text-foreground md:grid-cols-3">
            {facilities.map((f) => (
              <li key={f.name}>・{f.name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Access: editorial list + italic 駐車場 */}
      <section>
        <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
          — Access —
        </p>
        <h2 className="mt-4 font-heading text-2xl font-light md:text-3xl">
          アクセス
        </h2>
        <p className="mt-6 flex items-start gap-2 text-base text-foreground">
          <IconMapPin
            className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>{space.lineAddress}</span>
        </p>
        {space.location && space.location.accessLines.length > 0 ? (
          <ol className="mt-4 space-y-2 text-base leading-relaxed text-foreground">
            {space.location.accessLines.map((line) => (
              <li key={line}>・{line}</li>
            ))}
          </ol>
        ) : null}
        {space.location?.parkingInfo ? (
          <p className="mt-6 text-sm italic text-muted-foreground">
            — {space.location.parkingInfo}
          </p>
        ) : null}
      </section>
    </div>
  );
}
