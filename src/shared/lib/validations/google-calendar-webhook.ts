import { z } from "zod";

function requiredHeader(message: string) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().min(1, { error: message }),
  );
}

export const googleCalendarWebhookHeadersSchema = z.object({
  channelId: requiredHeader("x-goog-channel-id が必要です"),
  resourceId: requiredHeader("x-goog-resource-id が必要です"),
  resourceState: z.enum(["sync", "exists", "not_exists"], {
    error: "x-goog-resource-state が不正です",
  }),
  channelToken: z.string().optional(),
  messageNumber: z.string().optional(),
});

export type GoogleCalendarWebhookHeaders = z.infer<
  typeof googleCalendarWebhookHeadersSchema
>;
