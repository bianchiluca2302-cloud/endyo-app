import { Capacitor } from '@capacitor/core'
import { updateFcmToken } from '../api/client'

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    await PushNotifications.register()

    PushNotifications.addListener('registration', async ({ value: token }) => {
      await updateFcmToken(token).catch(() => {})
    })

    PushNotifications.addListener('registrationError', err => {
      console.error('[Push] registration error:', err)
    })

    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      const data = action.notification?.data || {}
      const type = data.type
      if (!type) return
      // Naviga alla sezione giusta quando l'utente tocca la notifica
      if (type === 'like' || type === 'comment') {
        window.location.hash = '#/social'
      } else if (type === 'follow' || type === 'follow_request' || type === 'follow_accepted') {
        window.location.hash = '#/friends'
      }
    })
  } catch (e) {
    console.error('[Push] init error:', e)
  }
}
