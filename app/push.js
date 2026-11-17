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

  // ---------------------------------------------------- časovač vaření

  let audio = null;

  /** Zvuk v prohlížeči jde spustit jen po klepnutí – připravit ho předem. */
  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }

  /** Pípání budíku: 3× tři tóny, celkem asi 4 s. */
  function beep() {
    const ctx = unlockAudio();
    if (!ctx) return false;
    const start = ctx.currentTime + 0.05;
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) {
        const t = start + round * 1.3 + i * 0.28;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = i === 2 ? 1320 : 990;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.22);
      }
    }
    return true;
  }

  window.hinkTimer = {
    /** Volá se při spuštění časovače (klepnutí): odemkne zvuk, požádá o oznámení. */
    async prepare() {
      unlockAudio();
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (_) {}
      }
      return Notification.permission === 'granted';
    },

    /** Časovač doběhl: pípání, vibrace a oznámení prohlížeče. */
    async ring(title, body, tag) {
      beep();
      if (navigator.vibrate) navigator.vibrate([600, 300, 600, 300, 600]);
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const options = {
        body,
        tag,
        renotify: true,
        requireInteraction: true,
        vibrate: [600, 300, 600, 300, 600],
        icon: 'icons/Icon-192.png',
        badge: 'icons/Icon-192.png',
        data: { url: location.href },
      };
      try {
        if ('serviceWorker' in navigator) {
          const reg = await registration();
          await reg.showNotification(title, options);
          return;
        }
      } catch (_) {}
      try {
        new Notification(title, options);
      } catch (_) {}
    },

    /** Zavře oznámení zrušeného nebo potvrzeného časovače. */
    async close(tag) {
      if (!('serviceWorker' in navigator)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration('./');
        if (!reg) return;
        for (const n of await reg.getNotifications({ tag })) n.close();
      } catch (_) {}
    },
  };

  // ---------------------------------------------------- aktualizace

  window.hinkUpdate = {
    /** Text z adresy bez mezipaměti prohlížeče (null = nedostupné). */
    async fetchText(url) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        return res.ok ? await res.text() : null;
      } catch (_) {
        return null;
      }
    },

    /** Načte novou verzi (obejde mezipaměť stránky). */
    reload() {
      const url = new URL(location.href);
      url.searchParams.set('v', Date.now().toString(36));
      location.replace(url.toString());
    },
  };

  // Když už jsou oznámení povolená, ať je service worker vždy připravený.
  if (supported() && Notification.permission === 'granted') {
    registration().catch(() => {});
  }
})();
