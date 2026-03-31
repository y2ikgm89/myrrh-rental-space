import { useSortable } from "@dnd-kit/sortable";
import { toTranslate3d } from "@/admin/components/ui/sortable";
import { Button, Switch } from "@/admin/components/ui";
import {
  IconGripVertical,
  IconSettings,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconSparkles,
  IconStack2,
  IconLayout,
  IconLayoutList,
  IconBulb,
  IconNews,
  IconFileText,
  IconHelpCircle,
  IconStar,
  IconMessage,
  IconPhoto,
  IconPointer,
  IconMail,
  IconMapPin,
  IconCode,
  IconWand,
  IconAperture,
} from "@tabler/icons-react";
import {
  SectionType,
  sectionTypeLabels,
} from "@/admin/lib/validations/homepage-section";
import type { HomepageSectionData } from "@/admin/queries/homepage-settings";
import type { Serialized } from "@/shared/lib/serialize";

// =============================================================================
// Icons Mapping
// =============================================================================

export const sectionTypeIcons: Record<SectionType, typeof IconSparkles> = {
  [SectionType.HERO]: IconSparkles,
  [SectionType.HERO_PARALLAX]: IconStack2,
  [SectionType.CUSTOM]: IconWand,
  [SectionType.CONCEPT]: IconBulb,
  [SectionType.SPACE_LIST]: IconLayout,
  [SectionType.SPACE_SHOWCASE]: IconLayoutList,
  [SectionType.NEWS_LIST]: IconNews,
  [SectionType.POST_LIST]: IconFileText,
  [SectionType.FAQ_LIST]: IconHelpCircle,
  [SectionType.FEATURES]: IconStar,
  [SectionType.TESTIMONIAL]: IconMessage,
  [SectionType.GALLERY]: IconPhoto,
  [SectionType.CTA]: IconPointer,
  [SectionType.CONTACT_FORM]: IconMail,
  [SectionType.MAP]: IconMapPin,
  [SectionType.EMBED]: IconCode,
  [SectionType.INSTAGRAM]: IconAperture,
};

// =============================================================================
// Sortable Section Item
// =============================================================================

export interface SortableSectionItemProps {
  section: Serialized<HomepageSectionData>;
  onEdit: (section: Serialized<HomepageSectionData>) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}

export function SortableSectionItem({
  section,
  onEdit,
  onToggle,
  onDelete,
  disabled,
}: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const Icon = sectionTypeIcons[section.type];
  const label = sectionTypeLabels[section.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border bg-card p-4 ${
        !section.isActive ? "opacity-60" : ""
      } ${isDragging ? "z-50 shadow-lg ring-2 ring-primary/20" : ""}`}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        disabled={disabled}
      >
        <IconGripVertical className="h-5 w-5" />
      </button>

      {/* Icon & Label */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-md bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{section.title || label}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        {section.isActive ? (
          <span className="flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-1 rounded">
            <IconEye className="h-3 w-3" />
            表示
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            <IconEyeOff className="h-3 w-3" />
            非表示
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Switch
          checked={section.isActive}
          onCheckedChange={(checked: boolean) => onToggle(section.id, checked)}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(section)}
          disabled={disabled}
        >
          <IconSettings className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(section.id)}
          disabled={disabled}
        >
          <IconTrash className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
