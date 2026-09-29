import type { Ref } from 'vue'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AuthenticatedProfile } from './useAuthSession'

export function useAdminNav(profile: Ref<AuthenticatedProfile | null>) {
  return computed<NavigationMenuItem[]>(() => {
    const items: NavigationMenuItem[] = [
      { label: 'Events', icon: 'i-lucide-calendar', to: '/admin/events' }
    ]

    if (profile.value?.role === 'administrator') {
      items.push(
        { label: 'Create Event', icon: 'i-lucide-plus-circle', to: '/admin/events/new' },
        { label: 'Restore from Backup', icon: 'i-lucide-rotate-ccw', to: '/admin/events/restore' },
        { label: 'Event Managers', icon: 'i-lucide-users', to: '/admin/event-managers' },
        { label: 'Templates', icon: 'i-lucide-layout-template', to: '/admin/templates' },
        { label: 'Blocked Terms', icon: 'i-lucide-shield-ban', to: '/admin/blocked-terms' },
        { label: 'Audit Log', icon: 'i-lucide-scroll-text', to: '/admin/audit-log' },
        { label: 'Usage & Guardrails', icon: 'i-lucide-gauge', to: '/admin/usage' }
      )
    }

    return items
  })
}
