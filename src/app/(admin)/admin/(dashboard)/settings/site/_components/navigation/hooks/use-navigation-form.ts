'use client'

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { NavigationType } from '@/shared/db/enums'
import {
  type NavFormData,
  type SocialFormData,
  navFormSchema,
  socialFormSchema,
  type NavigationItemData,
  type SocialLinkData,
  type FlatNavigationItem,
} from '../types'

// =============================================================================
// Flatten items for D&D (parent + children in order)
// =============================================================================

export function flattenNavItems(items: NavigationItemData[]): FlatNavigationItem[] {
  const result: FlatNavigationItem[] = []
  for (const item of items) {
    result.push({ ...item, isChild: false })
    for (const child of item.children) {
      result.push({ ...child, isChild: true })
    }
  }
  return result
}

// =============================================================================
// Navigation Form Hook
// =============================================================================

export type UseNavigationFormReturn = {
  form: ReturnType<typeof useForm<NavFormData>>
  navIsExternal: boolean
  navIsActive: boolean
  navType: NavigationType
  navParentId: string | null
  resetForCreate: (type: NavigationType, itemCount: number) => void
  resetForEdit: (item: NavigationItemData) => void
}

export function useNavigationForm(): UseNavigationFormReturn {
  const form = useForm<NavFormData>({
    resolver: zodResolver(navFormSchema),
    defaultValues: {
      type: 'HEADER_DESKTOP',
      parentId: null,
      label: '',
      url: '',
      isExternal: false,
      order: 0,
      isActive: true,
    },
  })

  const navIsExternal = useWatch({ control: form.control, name: 'isExternal' })
  const navIsActive = useWatch({ control: form.control, name: 'isActive' })
  const navType = useWatch({ control: form.control, name: 'type' })
  const navParentId = useWatch({ control: form.control, name: 'parentId' })

  const resetForCreate = (type: NavigationType, itemCount: number) => {
    form.reset({
      type,
      parentId: null,
      label: '',
      url: '',
      isExternal: false,
      order: itemCount,
      isActive: true,
    })
  }

  const resetForEdit = (item: NavigationItemData) => {
    form.reset({
      type: item.type,
      parentId: item.parentId,
      label: item.label,
      url: item.url,
      isExternal: item.isExternal,
      order: item.order,
      isActive: item.isActive,
    })
  }

  return {
    form,
    navIsExternal,
    navIsActive,
    navType,
    navParentId,
    resetForCreate,
    resetForEdit,
  }
}

// =============================================================================
// Social Form Hook
// =============================================================================

export type UseSocialFormReturn = {
  form: ReturnType<typeof useForm<SocialFormData>>
  socialPlatform: SocialFormData['platform']
  socialIsActive: boolean
  socialShowOnDesktop: boolean
  socialShowOnMobile: boolean
  resetForCreate: (linkCount: number) => void
  resetForEdit: (link: SocialLinkData) => void
}

export function useSocialForm(): UseSocialFormReturn {
  const form = useForm<SocialFormData>({
    resolver: zodResolver(socialFormSchema),
    defaultValues: {
      platform: 'TWITTER',
      url: '',
      iconUrl: null,
      order: 0,
      isActive: true,
      showOnDesktop: true,
      showOnMobile: true,
    },
  })

  const socialPlatform = useWatch({ control: form.control, name: 'platform' })
  const socialIsActive = useWatch({ control: form.control, name: 'isActive' })
  const socialShowOnDesktop = useWatch({ control: form.control, name: 'showOnDesktop' })
  const socialShowOnMobile = useWatch({ control: form.control, name: 'showOnMobile' })

  const resetForCreate = (linkCount: number) => {
    form.reset({
      platform: 'TWITTER',
      url: '',
      iconUrl: null,
      order: linkCount,
      isActive: true,
      showOnDesktop: true,
      showOnMobile: true,
    })
  }

  const resetForEdit = (link: SocialLinkData) => {
    form.reset({
      platform: link.platform,
      url: link.url,
      iconUrl: link.iconUrl,
      order: link.order,
      isActive: link.isActive,
      showOnDesktop: link.showOnDesktop,
      showOnMobile: link.showOnMobile,
    })
  }

  return {
    form,
    socialPlatform,
    socialIsActive,
    socialShowOnDesktop,
    socialShowOnMobile,
    resetForCreate,
    resetForEdit,
  }
}
