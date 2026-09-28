export const VAPID_PUBLIC_KEY = 'BCNLWQuTLyzcjLpu47mZ8EN_aSvsQRDg3FkhgwiOvk7cMZIoBnpXnX7Lv-vI5dcweDnqpNOjt11Dp18-Hb0y_1c';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 
         'serviceWorker' in navigator && 
         'PushManager' in window && 
         'Notification' in window;
}

export function isNotificationGranted(): boolean {
  return typeof window !== 'undefined' && 
         'Notification' in window && 
         Notification.permission === 'granted';
}

/**
 * Registra o Service Worker do PWA
 */
export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    console.log('[PWA] Service Worker registrado com sucesso:', registration.scope);
    return registration;
  } catch (err) {
    console.warn('[PWA] Falha ao registrar Service Worker:', err);
    return null;
  }
}

/**
 * Solicita permissão de notificação e inscreve o aparelho no Web Push do servidor
 */
export async function subscribeToPushNotifications(establishmentId: string): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Notificações push não são suportadas neste navegador/dispositivo.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permissão de notificação negada pelo usuário.' };
    }

    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await registerPwaServiceWorker() || undefined;
    }

    if (!registration) {
      return { success: false, error: 'Service worker não inicializado.' };
    }

    // Aguarda o Service Worker estar pronto
    await navigator.serviceWorker.ready;

    // Obtém ou cria a assinatura Push
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // Salva a inscrição no backend
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        establishmentId,
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log('[PWA] Aparelho inscrito com sucesso no Push Notifications!');
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Falha ao salvar inscrição no servidor.' };
    }
  } catch (err: any) {
    console.error('[PWA Push Subscribe Error]:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Toca o som de alerta característico de novo pedido (Web Audio API)
 */
export function playNewOrderChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    // Primeiro tom
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Segundo tom (mais agudo e alegre)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.00, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.4, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.65);
  } catch (e) {
    console.warn('Audio chime warning:', e);
  }
}
