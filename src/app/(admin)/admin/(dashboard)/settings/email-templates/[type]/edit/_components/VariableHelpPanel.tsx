"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { TemplateVariable } from "@/shared/lib/email/template-registry";

type Props = {
  variables: readonly TemplateVariable[];
};

export function VariableHelpPanel({ variables }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">利用可能な変数</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {variables.map((variable) => (
            <li key={variable.name} className="space-y-1 text-sm">
              <code className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {`{{${variable.name}}}`}
              </code>
              <p className="text-muted-foreground">
                {variable.description}
              </p>
              <p className="text-xs text-muted-foreground">
                例: {variable.example}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
