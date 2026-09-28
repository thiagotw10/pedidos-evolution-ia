// Service Worker para Notificações em Segundo Plano (PWA + Firebase Cloud Messaging)
const CACHE_NAME = 'iapedido-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Captura mensagens Push enviadas pelo servidor (mesmo com o app fechado)
self.addEventListener('push', (event) => {
  let title = '🔔 Novo Pedido no iaPedido!';
  let body = 'Um novo pedido acabou de chegar no WhatsApp.';
  let orderData = {};

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.notification) {
        title = payload.notification.title || title;
        body = payload.notification.body || body;
      } else if (payload.title) {
        title = payload.title;
        body = payload.body || body;
      }
      orderData = payload.data || payload;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [300, 150, 300, 150, 450],
    tag: orderData.orderId ? `order-${orderData.orderId}` : `iapedido-${Date.now()}`,
    renotify: true,
    requireInteraction: true, // Mantém a notificação visível até o lojista clicar
    data: {
      url: '/?tab=orders',
      orderId: orderData.orderId,
      ...orderData
    },
    actions: [
      { action: 'open_order', title: '👀 Ver Pedido' },
      { action: 'dismiss', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Clique na notificação abre o app diretamente na aba de pedidos
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/?tab=orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se já houver uma aba aberta, foca nela
      for (let client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NEW_ORDER_PUSH_CLICKED',
            orderId: event.notification.data?.orderId
          });
          return client.focus();
        }
      }
      // Se não houver aba aberta, abre uma nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
