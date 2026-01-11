import { getAnnouncementBars } from '@/actions/admin/announcement-bar'
import { getAnnouncementBarCarouselSettings } from '@/actions/admin/settings'
import { AnnouncementBarManager } from './_components/AnnouncementBarManager'

export default async function AnnouncementBarPage() {
  const [{ items }, carouselSettings] = await Promise.all([
    getAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ])

  return (
    <AnnouncementBarManager
      initialBars={items}
      initialCarouselSettings={carouselSettings}
    />
  )
}
