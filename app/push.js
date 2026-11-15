// HINKredience° – most mezi aplikací (Flutter) a oznámeními prohlížeče.
(function () {
  'use strict';

  const SW_URL = 'push_sw.js';

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  async function registration() {
    const existing = await navigator.serviceWorker.getRegistration('./');
    if (existing && existing.active && existing.active.scriptURL.endsWith(SW_URL)) return existing;
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: './' });
    await navigator.serviceWorker.ready;
    return reg;
  }

  function keyBytes(base64url) {
    const s = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  function b64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  window.hinkPush = {
    supported,

    /** 'granted' | 'denied' | 'default' | 'unsupported' */
    permission() {
      return supported() ? Notification.permission : 'unsupported';
    },

    /** Je aplikace spuštěná z plochy (iPhone to pro oznámení vyžaduje)? */
    standalone() {
      return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    },

    /** Povolí oznámení a přihlásí zařízení. Vrací JSON {endpoint, p256dh, auth}. */
    async subscribe(publicKey) {
      if (!supported()) throw new Error('Tento prohlížeč oznámení neumí.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Oznámení nejsou povolená.');
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      const wanted = keyBytes(publicKey);
      if (sub && sub.options && sub.options.applicationServerKey) {
        const current = new Uint8Array(sub.options.applicationServerKey);
        const same = current.length === wanted.length && current.every((b, i) => b === wanted[i]);
        if (!same) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
      }
      return JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: b64url(sub.getKey('p256dh')),
        auth: b64url(sub.getKey('auth')),
      });
    },

    /** Odhlásí zařízení; vrací jeho endpoint (nebo ''). */
    async unsubscribe() {
      if (!supported()) return '';
      const reg = await navigator.serviceWorker.getRegistration('./');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) return '';
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      return endpoint;
    },

    /** Endpoint přihlášeného zařízení (nebo ''). */
    async current() {
      if (!supported()) return '';
      const reg = await navigator.serviceWorker.getRegistration('./');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      return sub ? sub.endpoint : '';
    },

    /** Oznámení hned (když je aplikace otevřená). */
    async show(title, body) {
      if (!supported() || Notification.permission !== 'granted') return false;
      try {
        const reg = await registration();
        await reg.showNotification(title, { body, icon: 'icons/Icon-192.png' });
        return true;
      } catch (_) {
        return false;
      }
    },
  };

  // Když už jsou oznámení povolená, ať je service worker vždy připravený.
  if (supported() && Notification.permission === 'granted') {
    registration().catch(() => {});
  }
})();
