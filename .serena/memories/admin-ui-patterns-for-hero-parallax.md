# Admin UI Patterns for 2-Tab HERO_PARALLAX Section Editor

## Overview
Research findings for implementing a 2-tab section editor for HERO_PARALLAX sections with "基本" (Basic) and "デザイン" (Design) tabs.

---

## 1. Tabs Component (Already Exists)

**Location**: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/tabs.tsx`

**Root Component**: `Tabs` (from Radix UI `@radix-ui/react-tabs`)

**Subcomponents**:
- `<Tabs>` - Root container
- `<TabsList>` - Container for tab triggers
- `<TabsTrigger>` - Individual tab button
- `<TabsContent>` - Container for tab content (hidden when inactive)

**Key Props**:
- `defaultValue={string}` - Default active tab (e.g., "basic")
- `value={state}` / `onValueChange={setState}` - Controlled mode
- `className` - Custom styling

**Styling Features**:
- Responsive overflow-x-auto for mobile
- Focus-visible rings
- Active state: `data-[state=active]:bg-background data-[state=active]:text-foreground`
- Inactive state: `data-[state=inactive]:hidden`

**Examples in Codebase**:
- FaqItemInlineEditor (lines 367-427): 2-tab "基本" / "SEO" pattern
- AnnouncementBarManager (lines 255-283): 2-tab "お知らせ一覧" / "デザイン・カルーセル設定" pattern
- TermsDetailView: Version management + settings tabs
- NavigationManager: 4-tab desktop/mobile/footer/social

---

## 2. Existing SectionEditor Pattern (Homepage Settings)

**Location**: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/SectionEditor.tsx`

**Architecture**:
- Single-card layout with sequential form components
- No tabs used in current implementation
- `TitleForm` Card + main config Card

**Key Pattern**:
```jsx
<div className="space-y-6">
  <Card>
    <CardHeader>
      <CardTitle>セクション情報</CardTitle>
      <CardDescription>セクションの基本情報</CardDescription>
    </CardHeader>
    <CardContent>
      <TitleForm />
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>セクション設定</CardTitle>
      <CardDescription>固有の設定</CardDescription>
    </CardHeader>
    <CardContent>
      {renderConfigForm()}
    </CardContent>
  </Card>
</div>
```

**Config Forms**:
- `HeroConfigForm` (lines 101-236): Image picker + CTAButtonEditor
- `SpaceListConfigForm` (lines 242-341): Input fields + Switch toggles
- `CustomConfigForm` (lines 766-835): Lexical editor integration
- All follow same structure: `useForm` + `zodResolver` + form submission

**Integration Pattern**:
```javascript
const {
  register,
  handleSubmit,
  setValue,
  control,
  formState: { errors },
} = useForm<HeroConfigInput, unknown, HeroConfig>({
  resolver: zodResolver(heroConfigSchema),
  defaultValues: config,
})

const imageUrl = useWatch({ control, name: 'backgroundImageUrl' })

const picker = useSingleMediaPicker({
  defaultUsage: 'GENERAL',
  onSelect: (media) => {
    if (media.length > 0) {
      setValue('fieldName', media[0].url)
    }
  },
})

// In JSX:
<bgPicker.MediaPicker />
```

---

## 3. CTAButtonEditor Component

**Location**: `src/shared/components/cta-button-editor/CTAButtonEditor.tsx`

**Props**:
```typescript
interface CTAButtonEditorProps {
  buttons: CTAButtonItem[]
  onChange: (buttons: CTAButtonItem[]) => void
  maxButtons?: number          // Default 5
  disabled?: boolean
  compact?: boolean            // For inspector panels
}
```

**Features**:
- Add button (with "+" icon when below maxButtons)
- Delete button per item (Trash2 icon)
- Move up/down (ArrowUp/ArrowDown icons)
- Edit: text, url, openInNewTab checkbox
- Advanced: Expandable `<details>` for custom colors (backgroundColor/textColor hex inputs)
- ColorInput helper for hex validation

**Styling**:
- Uses `cn()` utility
- Border styling: `border-current/15` (opacity-based borders)
- Rounded: Compact=`rounded`, Normal=`rounded-md`
- Icons from lucide-react

**Used in**:
- SectionEditor (HeroConfigForm, CtaConfigForm)
- PageSectionEditor (HeroConfigForm, CtaConfigForm)

---

## 4. FAQ Tabs Pattern (Good Model for HERO_PARALLAX)

**Location**: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemInlineEditor.tsx`

**Tab Structure** (lines 367-427):
```jsx
<Tabs defaultValue="basic" className="w-full">
  <TabsList className="grid w-full grid-cols-2">
    <TabsTrigger value="basic">基本</TabsTrigger>
    <TabsTrigger value="seo">SEO</TabsTrigger>
  </TabsList>

  <TabsContent value="basic" className="mt-4 space-y-4">
    {/* Form fields */}
  </TabsContent>

  <TabsContent value="seo" className="mt-4 space-y-4">
    {/* SEO fields */}
  </TabsContent>
</Tabs>
```

**Key Points**:
- `grid w-full grid-cols-2` for 2 columns
- `mt-4 space-y-4` for content spacing
- Lexical editor for rich text (lazy loaded with dynamic import)
- useWatch for conditional rendering
- Unified form submission across both tabs

---

## 5. Page Section Editor (Dynamic Section Types)

**Location**: `src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/_components/PageSectionEditor.tsx`

**Pattern**:
- Routes section type → appropriate ConfigForm
- HeroConfigForm includes media picker + CTAButtonEditor
- Similar to SectionEditor but for custom pages

**Supported in Pages**:
- HERO (with buttons)
- CONTACT_FORM
- CUSTOM (Lexical)
- FAQ_LIST, SPACE_LIST, NEWS_LIST, POST_LIST
- GALLERY, TESTIMONIAL, MAP, EMBED

**IMPORTANT**: Page sections use different validation schemas than homepage sections
- `@/shared/lib/validations/section` (for custom pages)
- vs. `@/admin/lib/validations/homepage-section` (for homepage)

---

## 6. Color Input Pattern (in CTAButtonEditor)

**Location**: `src/shared/components/cta-button-editor/CTAButtonEditor.tsx` lines 329-367

```typescript
function ColorInput({ label, value, onChange, disabled, compact }: ColorInputProps) {
  const valid = isValidHexColor(value)  // Utility: validates #XXXXXX format

  return (
    <div>
      <label className="mb-0.5 block text-[10px] opacity-50">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          maxLength={7}
          className={cn(
            'rounded border bg-transparent px-2 py-1 font-mono text-xs outline-none',
            valid ? 'border-current/15 focus:border-current/40' : 'border-red-400'
          )}
        />
        {value && valid && (
          <span
            className="inline-block h-5 w-5 shrink-0 rounded border border-current/20"
            style={{ backgroundColor: value }}
          />
        )}
      </div>
    </div>
  )
}
```

**Features**:
- HEX input with real-time validation
- Color preview swatch (only when valid)
- Error styling (red border on invalid)
- Font-mono for code appearance
- Utilizes `isValidHexColor()` from `@/shared/lib/validations/section-design`

**No native color picker used** - custom text input with preview

---

## 7. Media Picker Hook

**Location**: `@/admin/hooks/use-media-picker`

**Pattern**:
```javascript
const picker = useSingleMediaPicker({
  defaultUsage: 'GENERAL',  // or other MediaUsage enum values
  onSelect: (media) => {
    if (media.length > 0) {
      setValue('fieldName', media[0].url)  // Update form value
    }
  },
})

// Render the dialog:
<button onClick={() => picker.openPicker()}>
  <ImagePlus className="mr-1 h-3 w-3" />
  画像を選択
</button>

{/* Include the dialog component */}
<picker.MediaPicker />
```

---

## 8. Design Patterns to Reuse for HERO_PARALLAX

### Pattern A: Two-Tab Card Structure
```jsx
<Tabs defaultValue="basic" className="w-full">
  <TabsList className="grid w-full grid-cols-2">
    <TabsTrigger value="basic">基本</TabsTrigger>
    <TabsTrigger value="design">デザイン</TabsTrigger>
  </TabsList>

  <TabsContent value="basic" className="mt-4 space-y-4">
    {/* Basic form: title, subtitle, image, buttons */}
  </TabsContent>

  <TabsContent value="design" className="mt-4 space-y-4">
    {/* Design form: animations, parallax depth, overlay, spacing */}
  </TabsContent>
</Tabs>
```

### Pattern B: Media Picker Integration
Already shown in SectionEditor HeroConfigForm - just reuse

### Pattern C: CTAButtonEditor Reuse
```jsx
<CTAButtonEditor
  buttons={buttons}
  onChange={handleButtonsChange}
  disabled={isPending}
/>
```

### Pattern D: Hex Color Input
Reuse `ColorInput` component from CTAButtonEditor or extract if needed

### Pattern E: Form State Management
```javascript
const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<Input, unknown, Config>({
  resolver: zodResolver(schema),
  defaultValues: config,
})

const handleSave = (formData: Config) => {
  startTransition(async () => {
    const result = await updateAction(sectionId, formData)
    if (result.success) {
      toast.success('保存しました')
      onSave()
    } else {
      toast.error(result.error)
    }
  })
}
```

---

## 9. AnnouncementBarManager "デザイン" Tab Example

**Location**: `src/app/(admin)/admin/(dashboard)/settings/site/_components/announcement-bar/AnnouncementBarManager.tsx` lines 255-283

```jsx
<Tabs defaultValue="bars" className="space-y-4">
  <TabsList>
    <TabsTrigger value="bars">お知らせ一覧</TabsTrigger>
    <TabsTrigger value="design">デザイン・カルーセル設定</TabsTrigger>
  </TabsList>

  <TabsContent value="bars">
    <BarList
      bars={bars}
      onEdit={setEditingBar}
      onDelete={setDeletingId}
      isPending={isPending}
    />
  </TabsContent>

  <TabsContent value="design">
    <CarouselSettingsPanel
      settings={carouselSettings}
      onSave={handleCarouselSave}
      isPending={isPending}
    />
  </TabsContent>
</Tabs>
```

**Note**: Uses `space-y-4` on Tabs root, not on TabsContent

---

## 10. Spacing and Layout Constants

**Card structure** (standard):
```jsx
<Card>
  <CardHeader>
    <CardTitle>タイトル</CardTitle>
    <CardDescription>説明</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4 | space-y-6">
    {/* form fields */}
  </CardContent>
</Card>
```

**Form field groups**: `space-y-4` or `space-y-6`
**Tab content**: `mt-4 space-y-4`
**Buttons**: `flex gap-2`

---

## 11. Import Requirements for HERO_PARALLAX Section Editor

```javascript
// UI Components
import { 
  Button, 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Input, 
  Label, 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger,
  Textarea,
  Switch,
} from '@/admin/components/ui'

// Icons
import { ArrowLeft, Save, ImagePlus, ChevronDown } from 'lucide-react'

// Hooks
import { useForm, useWatch } from 'react-hook-form'
import { useTransition } from 'react'
import { useSingleMediaPicker } from '@/admin/hooks/use-media-picker'

// Components
import { CTAButtonEditor } from '@/shared/components/cta-button-editor'

// Utilities
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
```

---

## 12. No Existing Color Picker Component in Admin

**Finding**: No standalone ColorPicker component exists. 
- CTAButtonEditor uses simple hex text input with preview
- Lexical editor has text color menu (TextColorPlugin) with preset colors
- No third-party color picker library integrated

**Recommendation for HERO_PARALLAX Design Tab**:
- Use ColorInput pattern from CTAButtonEditor (hex text input)
- OR implement simple color swatches for preset colors (primary, secondary, etc.)
- Keep it minimal

---

## 13. Section Type Validation Schemas

**Homepage Sections** (HERO_PARALLAX would use this):
- Location: `@/admin/lib/validations/homepage-section.ts`
- Types: `HeroConfig`, `HeroConfigInput`
- Schema: `heroConfigSchema`

**Custom Page Sections** (different schemas):
- Location: `@/shared/lib/validations/section.ts`
- Don't use for HERO_PARALLAX

---

## 14. Styling Notes

**Admin UI uses semantic color tokens**:
- From `admin.css`: `--color-primary`, `--color-secondary`, `--color-destructive`
- Components use `bg-primary`, `bg-secondary`, `text-foreground`, `text-muted-foreground`
- Border opacity pattern: `border-current/10`, `border-current/20` etc.

**No hardcoded colors like `bg-blue-500`**

---

## Next Steps for Implementation

1. **Create HeroParallaxConfigForm**:
   - Inherit pattern from HeroConfigForm
   - Add image picker for media
   - Add CTAButtonEditor for buttons
   - Add new parallax-specific fields

2. **Create HeroParallaxDesignForm**:
   - Animation style selector (fade, slide, parallax, etc.)
   - Parallax depth slider (0-100)
   - Overlay color + opacity inputs
   - Spacing/padding controls
   - Background gradient (optional)

3. **Integrate into SectionEditor**:
   - Add case for `SectionType.HERO_PARALLAX`
   - Render both forms in Tabs
   - Unify form submission

4. **Test with existing patterns**:
   - Media picker integration (from HeroConfigForm)
   - CTAButtonEditor (existing component)
   - Hex color inputs (from CTAButtonEditor)
   - Zod schema validation
