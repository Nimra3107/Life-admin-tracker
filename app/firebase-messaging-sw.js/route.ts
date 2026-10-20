import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Service worker for Firebase Cloud Messaging, served from the app root so its
 * scope covers every page. The Firebase web config is injected at request time
 * (it is public by design); Admin credentials never appear here.
 */
export async function GET() {
  const config = JSON.stringify({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  })

  const body = `/* Life Admin Tracker FCM service worker (generated at request time). */

// Take over promptly so a corrected worker replaces one that double-displayed
// notifications instead of waiting for every tab to close.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Registered before the Firebase SDK scripts so this listener runs first: the
// SDK's click handler only focuses a tab, while this one opens the item.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();

  const fcmMessage = event.notification.data && event.notification.data.FCM_MSG;
  const data = (fcmMessage && fcmMessage.data) || event.notification.data || {};
  const target = data.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            if ('navigate' in client) client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(${config});
firebase.messaging();

// Do NOT call self.registration.showNotification from onBackgroundMessage.
// firebase-messaging-compat already displays every message that carries a
// notification payload; calling showNotification here as well displayed each
// reminder twice (the duplicate-notification bug). Messages sent by the cron
// route also carry a stable tag (the reminder id), so if the same reminder is
// delivered more than once to this browser it replaces the existing
// notification instead of stacking another one.
`

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
