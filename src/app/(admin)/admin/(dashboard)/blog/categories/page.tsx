import { getBlogCategories } from '@/admin/actions/blog'
import { CategoryManager } from './_components/CategoryManager'

export default async function BlogCategoriesPage() {
  const categories = await getBlogCategories()

  return <CategoryManager initialCategories={categories} />
}
