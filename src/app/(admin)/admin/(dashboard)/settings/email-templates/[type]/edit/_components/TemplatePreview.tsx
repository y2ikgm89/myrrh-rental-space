"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { TemplateVariable } from "@/shared/lib/email/template-registry";
import { renderTemplate } from "@/shared/lib/email/variables";

type Props = {
  variables: readonly TemplateVariable[];
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
};

export function TemplatePreview({
  variables,
  subject,
  greeting,
  intro,
  outro,
}: Props) {
  const values = Object.fromEntries(variables.map((v) => [v.name, v.example]));

  const renderedSubject = renderTemplate(subject, values);
  const renderedGreeting = renderTemplate(greeting, values);
  const renderedIntro = renderTemplate(intro, values);
  const renderedOutro = renderTemplate(outro, values);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">プレビュー</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">件名</p>
          <p className="font-medium text-foreground">
            {renderedSubject || "(未入力)"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">挨拶文</p>
          <p className="text-foreground">{renderedGreeting || "(未入力)"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">導入文</p>
          <p className="whitespace-pre-wrap text-foreground">
            {renderedIntro || "(未入力)"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">締め文</p>
          <p className="whitespace-pre-wrap text-foreground">
            {renderedOutro || "(未入力)"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
