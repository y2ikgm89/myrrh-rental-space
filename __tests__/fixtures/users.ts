/**
 * ユーザーテストデータ
 */

import { Role } from '@/shared/generated/prisma/enums'
import type { MockUser } from '../mocks/auth'

export const SUPER_ADMIN_USER: MockUser = {
  id: 'super-admin-id',
  email: 'superadmin@example.com',
  name: 'Super Admin',
  role: Role.SUPER_ADMIN,
  emailVerified: true,
  image: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

export const ADMIN_USER: MockUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  name: 'Admin User',
  role: Role.ADMIN,
  emailVerified: true,
  image: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

export const EDITOR_USER: MockUser = {
  id: 'editor-id',
  email: 'editor@example.com',
  name: 'Editor User',
  role: Role.EDITOR,
  emailVerified: true,
  image: null,
  assignedPages: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

export const VIEWER_USER: MockUser = {
  id: 'viewer-id',
  email: 'viewer@example.com',
  name: 'Viewer User',
  role: Role.VIEWER,
  emailVerified: true,
  image: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

export const REGULAR_USER: MockUser = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'Regular User',
  role: Role.USER,
  emailVerified: true,
  image: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

/**
 * 指定ページに割り当てられたEDITORを作成
 */
export function createEditorWithPages(pageIds: string[]): MockUser {
  return {
    ...EDITOR_USER,
    assignedPages: pageIds,
  }
}
