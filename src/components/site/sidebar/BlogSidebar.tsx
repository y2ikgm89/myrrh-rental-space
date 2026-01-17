import { tv } from 'tailwind-variants'
import { SearchWidget } from './SearchWidget'
import { RecentPostsWidget } from './RecentPostsWidget'
import { PopularPostsWidget } from './PopularPostsWidget'
import { CategoriesWidget } from './CategoriesWidget'
import { TagsWidget } from './TagsWidget'
import type { ReactElement } from 'react'
import type { SidebarData } from '@/actions/public/sidebar'
import type { SidebarWidgets } from '@/lib/validations/sidebar'

const styles = tv({
  slots: {
    sidebar: 'space-y-6',
  },
})()

interface BlogSidebarProps {
  settings?: SidebarWidgets
  data: SidebarData
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
export function BlogSidebar({ settings = defaultSettings, data }: BlogSidebarProps): ReactElement {
  const {
    search,
    recent,
    popular,
    categories,
    tags,
  } = { ...defaultSettings, ...settings }

  return (
    <aside className={styles.sidebar()}>
      {search && <SearchWidget />}

      {recent && data.recentPosts && (
        <RecentPostsWidget posts={data.recentPosts} />
      )}

      {popular && data.popularPosts && (
        <PopularPostsWidget posts={data.popularPosts} />
      )}

      {categories && data.categories && (
        <CategoriesWidget categories={data.categories} />
      )}

      {tags && data.tags && (
        <TagsWidget tags={data.tags} />
      )}
    </aside>
  )
}
