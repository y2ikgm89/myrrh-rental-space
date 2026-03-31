"use client";

/**
 * セクションエディタ
 *
 * 各セクションタイプに応じた設定フォームを表示
 */

import { useTransition } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { DesignPanel } from "./DesignPanel";
import { IconArrowLeft, IconDeviceFloppy } from "@tabler/icons-react";
import {
  updateHomepageSection,
  type HomepageSectionData,
} from "@/admin/actions/homepage-settings";
import type { Serialized } from "@/shared/lib/serialize";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  SectionType,
  sectionTypeLabels,
} from "@/admin/lib/validations/homepage-section";
import {
  getHeroConfig,
  getHeroParallaxConfig,
  getConceptConfig,
  getSpaceShowcaseConfig,
  getFeaturesConfig,
  getSpaceListConfig,
  getNewsListConfig,
  getPostListConfig,
  getFaqListConfig,
  getCtaConfig,
  getCustomConfig,
  getInstagramConfig,
  getTestimonialConfig,
  getGalleryConfig,
  getContactFormConfig,
  getMapConfig,
  getEmbedConfig,
} from "@/shared/lib/validations/section-defaults";
import { HeroConfigForm } from "./section-editor/HeroConfigForm";
import { HeroParallaxConfigForm } from "./section-editor/HeroParallaxConfigForm";
import { ConceptConfigForm } from "./section-editor/ConceptConfigForm";
import { SpaceShowcaseConfigForm } from "./section-editor/SpaceShowcaseConfigForm";
import { FeaturesConfigForm } from "./section-editor/FeaturesConfigForm";
import { SpaceListConfigForm } from "./section-editor/SpaceListConfigForm";
import { NewsListConfigForm } from "./section-editor/NewsListConfigForm";
import { PostListConfigForm } from "./section-editor/PostListConfigForm";
import { FaqListConfigForm } from "./section-editor/FaqListConfigForm";
import { CtaConfigForm } from "./section-editor/CtaConfigForm";
import { CustomConfigForm } from "./section-editor/CustomConfigForm";
import { InstagramConfigForm } from "./section-editor/InstagramConfigForm";
import { TestimonialConfigForm } from "./section-editor/TestimonialConfigForm";
import { GalleryConfigForm } from "./section-editor/GalleryConfigForm";
import { ContactFormConfigForm } from "./section-editor/ContactFormConfigForm";
import { MapConfigForm } from "./section-editor/MapConfigForm";
import { EmbedConfigForm } from "./section-editor/EmbedConfigForm";

// =============================================================================
// Props
// =============================================================================

interface SectionEditorProps {
  section: Serialized<HomepageSectionData>;
  onBack: () => void;
  onSave: () => void;
  /** false にするとエディタ内蔵ヘッダーを非表示（専用ページで使用） */
  showHeader?: boolean;
}

// =============================================================================
// SectionEditor
// =============================================================================

export function SectionEditor({
  section,
  onBack,
  onSave,
  showHeader = true,
}: SectionEditorProps) {
  const [isPending, startTransition] = useTransition();
  const label = sectionTypeLabels[section.type];

  const handleConfigSave = (
    config: Record<string, unknown>,
    contentJson?: string,
  ) => {
    startTransition(async () => {
      const result = await updateHomepageSection(section.id, {
        config,
        contentJson,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("セクションを更新しました");
      onSave();
    });
  };

  const renderConfigForm = () => {
    const { config } = section;

    switch (section.type) {
      case SectionType.HERO:
        return (
          <HeroConfigForm
            config={getHeroConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.HERO_PARALLAX:
        return (
          <HeroParallaxConfigForm
            config={getHeroParallaxConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.CONCEPT:
        return (
          <ConceptConfigForm
            config={getConceptConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.SPACE_SHOWCASE:
        return (
          <SpaceShowcaseConfigForm
            config={getSpaceShowcaseConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.FEATURES:
        return (
          <FeaturesConfigForm
            config={getFeaturesConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.SPACE_LIST:
        return (
          <SpaceListConfigForm
            config={getSpaceListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.NEWS_LIST:
        return (
          <NewsListConfigForm
            config={getNewsListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.POST_LIST:
        return (
          <PostListConfigForm
            config={getPostListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.FAQ_LIST:
        return (
          <FaqListConfigForm
            config={getFaqListConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.CTA:
        return (
          <CtaConfigForm
            config={getCtaConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.CUSTOM:
        return (
          <CustomConfigForm
            config={getCustomConfig(config)}
            section={section}
            onSave={(c, contentJson) => handleConfigSave(c, contentJson)}
            isPending={isPending}
          />
        );
      case SectionType.INSTAGRAM:
        return (
          <InstagramConfigForm
            config={getInstagramConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.TESTIMONIAL:
        return (
          <TestimonialConfigForm
            config={getTestimonialConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.GALLERY:
        return (
          <GalleryConfigForm
            config={getGalleryConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.CONTACT_FORM:
        return (
          <ContactFormConfigForm
            config={getContactFormConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.MAP:
        return (
          <MapConfigForm
            config={getMapConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      case SectionType.EMBED:
        return (
          <EmbedConfigForm
            config={getEmbedConfig(config)}
            onSave={(c) => handleConfigSave(c)}
            isPending={isPending}
          />
        );
      default:
        return (
          <p className="text-muted-foreground">
            このセクションタイプは編集できません
          </p>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <IconArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <div>
            <h3 className="text-lg font-medium">
              {section.title || label}の設定
            </h3>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      )}

      {/* Title IconEdit */}
      <Card>
        <CardHeader>
          <CardTitle>セクション情報</CardTitle>
          <CardDescription>セクションの基本情報</CardDescription>
        </CardHeader>
        <CardContent>
          <TitleForm section={section} isPending={isPending} onSave={onSave} />
        </CardContent>
      </Card>

      {/* Content & Design Tabs */}
      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">コンテンツ</TabsTrigger>
          <TabsTrigger value="design">デザイン</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>セクション設定</CardTitle>
              <CardDescription>{label}固有の設定</CardDescription>
            </CardHeader>
            <CardContent>{renderConfigForm()}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design">
          <Card>
            <CardHeader>
              <CardTitle>デザイン設定</CardTitle>
              <CardDescription>
                余白・背景・テキストスタイリング・レイアウト
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DesignPanel section={section} onSave={onSave} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Title Form
// =============================================================================

const titleSchema = z.object({
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
});

type TitleFormData = z.infer<typeof titleSchema>;

function TitleForm({
  section,
  isPending,
  onSave,
}: {
  section: Serialized<HomepageSectionData>;
  isPending: boolean;
  onSave: () => void;
}) {
  const [isUpdating, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TitleFormData>({
    resolver: standardSchemaResolver(titleSchema),
    defaultValues: { title: section.title || "" },
  });

  const handleTitleSave = (data: TitleFormData) => {
    startTransition(async () => {
      const result = await updateHomepageSection(section.id, {
        title: data.title || undefined,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("タイトルを更新しました");
      onSave();
    });
  };

  return (
    <form onSubmit={handleSubmit(handleTitleSave)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="section-title">カスタムタイトル（任意）</Label>
        <Input
          id="section-title"
          {...register("title")}
          placeholder={sectionTypeLabels[section.type]}
          disabled={isPending || isUpdating}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          空欄の場合はデフォルトのタイトルが使用されます
        </p>
      </div>
      <SubmitButton
        isPending={isPending || isUpdating}
        label="タイトルを保存"
        pendingLabel="保存中..."
        variant="outline"
        size="sm"
      >
        <>
          <IconDeviceFloppy className="h-4 w-4 mr-2" />
          タイトルを保存
        </>
      </SubmitButton>
    </form>
  );
}
