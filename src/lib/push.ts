import { backend } from './backend';
import { readStored, writeStored } from './storage';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window;

export const pushPermission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported');

export const pushEnabled = () => pushPermission() === 'granted' && readStored<boolean>('aurevon.pushEnabled', false);

/** The worker only handles push/notification clicks — it never caches, so it's safe in dev too. */
export async function registerServiceWorker(): Promise<void> {
  if (!pushSupported()) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.warn('Service worker registration failed', e);
  }
}

const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * Ask permission, then (with Supabase + a VAPID key) subscribe this device for server push.
 * Without a VAPID key, notifications are shown by the open app for live events.
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    writeStored('aurevon.pushEnabled', false);
    return false;
  }
  writeStored('aurevon.pushEnabled', true);
  if (VAPID_PUBLIC_KEY && backend.kind === 'supabase') {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
    await backend.savePushSubscription(sub.toJSON());
  }
  return true;
}

export function disablePush(): void {
  writeStored('aurevon.pushEnabled', false);
}

/** Show a device notification from the running app (used for live booking/message events). */
export async function notifyDevice(title: string, body: string, url: string, tag?: string): Promise<void> {
  if (!pushEnabled()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag, data: { url } });
  } catch {
    new Notification(title, { body, icon: '/icons/icon-192.png', tag });
  }
}
