import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

function Passthrough({
  children,
  ...props
}: {
  children?: ReactNode;
  [key: string]: unknown;
}) {
  return <div {...props}>{children}</div>;
}

function FakeLexicalEditor({
  onChange,
}: {
  contentJson: string;
  onChange: (value: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid="editor-change"
      onClick={() => onChange('{"root":{"children":[{"text":"changed"}]}}')}
    >
      change editor
    </button>
  );
}

mock.module("next/dynamic", () => ({
  default: () => FakeLexicalEditor,
}));

mock.module("@/admin/components/ui", () => ({
  Accordion: Passthrough,
  AccordionContent: Passthrough,
  AccordionItem: Passthrough,
  AccordionTrigger: Passthrough,
  Button: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Card: Passthrough,
  CardContent: Passthrough,
  Input: (props: { [key: string]: unknown }) => <input {...props} />,
  Label: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <label {...props}>{children}</label>,
  Select: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  SelectContent: Passthrough,
  SelectItem: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
  SelectTrigger: Passthrough,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SubmitButton: ({
    children,
    disabled,
    isPending,
    label,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    isPending?: boolean;
    label?: string;
  }) => (
    <button type="submit" disabled={Boolean(disabled || isPending)}>
      {children ?? label}
    </button>
  ),
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    [key: string]: unknown;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      {...props}
    />
  ),
  Textarea: (props: { [key: string]: unknown }) => <textarea {...props} />,
  Table: ({ children }: { children?: ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children?: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableCell: ({ children, ...props }: { children?: ReactNode }) => (
    <td {...props}>{children}</td>
  ),
  TableRow: ({ children, ...props }: { children?: ReactNode }) => (
    <tr {...props}>{children}</tr>
  ),
}));

mock.module("next/image", () => ({
  default: (props: { [key: string]: unknown }) => <img alt="" {...props} />,
}));

mock.module("@/admin/hooks/use-media-picker", () => ({
  useSingleMediaPicker: () => ({
    openPicker: () => undefined,
    mediaPickerDialog: null,
  }),
}));

mock.module("@/admin/hooks/use-media-upload", () => ({
  useMediaUpload: () => ({
    uploadFile: () => Promise.resolve(null),
    isUploading: false,
  }),
}));

const { AutoSectionForm } =
  await import("@/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form");

describe("AutoSectionForm", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("custom セクションは Lexical 本文だけの変更でも保存可能にする", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AutoSectionForm
          section={{
            id: "section-1",
            pageId: "page-1",
            type: "custom",
            title: "本文",
            config: {
              sectionLabel: "Contents",
              maxWidth: "lg",
              containerClass: "",
              backgroundColor: "",
              padding: "md",
            },
            contentHtml: null,
            contentJson: { root: { children: [] } },
            order: 0,
            isActive: true,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          }}
          onSave={() => undefined}
          isPending={false}
        />,
      );
    });

    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(submit?.disabled).toBe(true);

    const editorChange = container.querySelector<HTMLButtonElement>(
      '[data-testid="editor-change"]',
    );
    expect(editorChange).not.toBeNull();

    await act(async () => {
      editorChange?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(submit?.disabled).toBe(false);
  });
});
