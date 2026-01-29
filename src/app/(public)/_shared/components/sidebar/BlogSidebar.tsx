import { tv } from 'tailwind-variants'
import { SearchWidgetWrapper } from './SearchWidgetWrapper'
import { RecentPostsWidget } from './RecentPostsWidget'
import { PopularPostsWidget } from './PopularPostsWidget'
import { CategoriesWidget } from './CategoriesWidget'
import { TagsWidget } from './TagsWidget'
import type { ReactElement } from 'react'
import type { SidebarData } from '@/public/actions/sidebar'
import type { SidebarWidgets } from '@/shared/lib/validations/sidebar'

const styles = tv({
  slots: {
    sidebar: 'space-y-6',
  },
})()

interface BlogSidebarProps {
  settings?: SidebarWidgets
  data: SidebarData
  postPrefix: string
}

const defaultSettings: SidebarWidgets = {
  search: true,
  recent: true,
  popular: true,
  categories: true,
  tags: true,
}

/**
 * ブログサイドバー
 *
 * @description 設定に基づいて各ウィジェットを条件付きレンダリング
 */
export function BlogSidebar({ settings = defaultSettings, data, postPrefix }: BlogSidebarProps): ReactElement {
  const {
    search,
    recent,
    popular,
    categories,
    tags,
  } = { ...defaultSettings, ...settings }

  return (
    <aside className={styles.sidebar()}>
      {search && <SearchWidgetWrapper postPrefix={postPrefix} />}

      {recent && data.recentPosts && (
        <RecentPostsWidget posts={data.recentPosts} postPrefix={postPrefix} />
      )}

      {popular && data.popularPosts && (
        <PopularPostsWidget posts={data.popularPosts} postPrefix={postPrefix} />
      )}

      {categories && data.categories && (
        <CategoriesWidget categories={data.categories} postPrefix={postPrefix} />
      )}

      {tags && data.tags && (
        <TagsWidget tags={data.tags} postPrefix={postPrefix} />
      )}
    </aside>
  )
}
