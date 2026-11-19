/**
 * Navigation Config, what appears in the top bar. Routes come from
 * generouted file-based routing in src/pages/.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
}

export const nav: NavItem[] = [
  { path: '/decisions', label: 'Decisions' },
  { path: '/api-status', label: 'API Status', devOnly: true },
]
