import {
  getNavigationItems,
  getSocialLinks,
} from '@/actions/admin/navigation'
import { NavigationManager } from './_components/NavigationManager'

export default async function NavigationSettingsPage() {
  const [desktopItems, mobileItems, footerItems, socialLinks] = await Promise.all([
    getNavigationItems('HEADER_DESKTOP'),
    getNavigationItems('HEADER_MOBILE'),
    getNavigationItems('FOOTER'),
    getSocialLinks(),
  ])

  return (
    <NavigationManager
      initialDesktopItems={desktopItems}
      initialMobileItems={mobileItems}
      initialFooterItems={footerItems}
      initialSocialLinks={socialLinks}
    />
  )
}
