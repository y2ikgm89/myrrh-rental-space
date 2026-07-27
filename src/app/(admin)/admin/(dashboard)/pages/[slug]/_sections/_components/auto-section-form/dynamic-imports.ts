import dynamic from "next/dynamic";

// IconPickerField は Tabler 100+ icons + IconPickerDialog を含む heavy chain (~300+ KB)。
export const IconPickerField = dynamic(
  () =>
    import("@/admin/components/icon-picker/IconPickerField").then((mod) => ({
      default: mod.IconPickerField,
    })),
  { ssr: false },
);

export const PortableTextInlineEditor = dynamic(
  () =>
    import("@/admin/components/portable-text/inline-editor/PortableTextInlineEditor").then(
      (mod) => ({ default: mod.PortableTextInlineEditor }),
    ),
  { ssr: false },
);

export const PortableTextBlockEditor = dynamic(
  () =>
    import("@/admin/components/portable-text/block-editor/PortableTextBlockEditor").then(
      (mod) => ({ default: mod.PortableTextBlockEditor }),
    ),
  { ssr: false },
);
