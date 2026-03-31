import { Button } from "../../../_shared/components/design-system/button";
import { Heading } from "../../../_shared/components/design-system/heading";
import { useFormatPrice } from "@/public/hooks/use-format-price";
import { Stack } from "../../../_shared/components/design-system/stack";

interface ReservationWidgetProps {
  readonly spaceName: string;
  readonly hourlyPrice: number;
  readonly dailyPrice: number | null;
}

export function ReservationWidget({
  hourlyPrice,
  dailyPrice,
}: ReservationWidgetProps) {
  const { formatUnit } = useFormatPrice();
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <Stack gap="lg">
        <Heading level={3}>料金</Heading>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">1時間</span>
            <span className="text-xl font-bold text-accent">
              {formatUnit(hourlyPrice, "/h")}
            </span>
          </div>
          {dailyPrice != null ? (
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">1日</span>
              <span className="text-xl font-bold text-accent">
                {formatUnit(dailyPrice, "/day")}
              </span>
            </div>
          ) : null}
        </div>

        <hr className="border-border" />

        <Button
          variant="primary"
          size="lg"
          href="/reservation"
          className="w-full"
        >
          このスペースを予約する
        </Button>

        <Button
          variant="secondary"
          size="md"
          href="/contact"
          className="w-full"
        >
          お問い合わせ
        </Button>
      </Stack>
    </div>
  );
}
