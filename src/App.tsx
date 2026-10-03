import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OrdersView } from './components/OrdersView';
import { ProductsView } from './components/ProductsView';
import { SimulatorView } from './components/SimulatorView';
import { WhatsAppView } from './components/WhatsAppView';
import { SettingsView } from './components/SettingsView';
import { CampaignsView } from './components/CampaignsView';
import { FinanceView } from './components/FinanceView';
import { BillingView } from './components/BillingView';
import { PublicStorefront } from './components/PublicStorefront';
import { AuthView } from './components/AuthView';
import { HomeView } from './components/HomeView';
import { SubscriptionGate } from './components/SubscriptionGate';
import { SubscriptionModal } from './components/SubscriptionModal';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { PwaInstallModal } from './components/PwaInstallModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MobileDrawer } from './components/MobileDrawer';
import { Order, Product, Establishment, OrderStatus } from './types';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [sessionUser, setSessionUser] = useState<{ uid: string; email?: string } | null>(() => {
    try {
      const saved = localStorage.getItem('iapedido_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [unauthView, setUnauthView] = useState<'home' | 'auth'>('home');
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('register');
  const [referralCode] = useState(() => new URLSearchParams(window.location.search).get('ref') || undefined);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isPwaInstallModalOpen, setIsPwaInstallModalOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const publicStoreId = window.location.pathname.match(/^\/loja\/([^/]+)/)?.[1] || new URLSearchParams(window.location.search).get('loja');

  const [currentTab, setCurrentTab] = useState<string>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const prevOrdersCountRef = useRef<number>(0);

  // Capture PWA beforeinstallprompt globally
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Monitor Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) setDemoMode(false);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const isAuthenticated = !!currentUser || !!sessionUser || demoMode;
  const storeId = currentUser?.uid || sessionUser?.uid || (demoMode ? 'default_store' : 'default_store');

  // Play browser chime using Web Audio API (no external file needed)
  const playNewOrderChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;

      // Note 1
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Note 2
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.2); // A5
      gain2.gain.setValueAtTime(0.4, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.8);
    } catch (e) {
      console.warn('AudioContext autoplay blocked or not supported:', e);
    }
  };

  // 1. Listen for Orders in Real-Time (Firestore)
  useEffect(() => {
    if (!isAuthenticated) return;
    setLoadingOrders(true);
    fetchOrdersFallback();
    try {
      const ordersRef = collection(db, 'establishments', storeId, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedOrders: Order[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Order));

        const pendingCount = fetchedOrders.filter(o => o.status === 'PENDENTE').length;
        if (pendingCount > prevOrdersCountRef.current && prevOrdersCountRef.current !== 0) {
          playNewOrderChime();
          // Notificação do navegador/sistema
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const newest = fetchedOrders[0];
            try {
              new Notification(`🔔 Novo Pedido #${newest?.orderNumber || ''}!`, {
                body: `${newest?.customerName || 'Cliente'} pediu: ${newest?.items?.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Novo pedido'} (R$ ${Number(newest?.total || 0).toFixed(2)})`,
                icon: '/icon-192.png',
                badge: '/icon-192.png'
              });
            } catch (e) {
              console.warn('Erro ao criar notificação local:', e);
            }
          }
        }
        prevOrdersCountRef.current = pendingCount;

        setOrders(fetchedOrders);
        setLoadingOrders(false);
      }, (err) => {
        console.warn('Firestore Orders onSnapshot error (using fallback):', err.message);
        fetchOrdersFallback();
      });

      return () => unsubscribe();
    } catch (err) {
      console.warn('Orders listener setup error:', err);
      fetchOrdersFallback();
    }
  }, [isAuthenticated, storeId, soundEnabled]);

  const fetchOrdersFallback = async () => {
    try {
      const res = await fetch(`/api/orders?establishmentId=${storeId}`);
      const data = await res.json();
      if (Array.isArray(data)) setOrders(data);
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  // 2. Listen for Products in Real-Time (Firestore)
  useEffect(() => {
    if (!isAuthenticated) return;
    setLoadingProducts(true);
    fetchProductsFallback();
    try {
      const productsRef = collection(db, 'establishments', storeId, 'products');
      const unsubscribe = onSnapshot(productsRef, (snapshot) => {
        const fetchedProducts: Product[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Product));
        setProducts(fetchedProducts);
        setLoadingProducts(false);
      }, (err) => {
        console.warn('Firestore Products onSnapshot error (using fallback):', err.message);
        fetchProductsFallback();
      });

      return () => unsubscribe();
    } catch (err) {
      console.warn('Products listener setup error:', err);
      fetchProductsFallback();
    }
  }, [isAuthenticated, storeId]);

  const fetchProductsFallback = async () => {
    try {
      const res = await fetch(`/api/products?establishmentId=${storeId}`);
      const data = await res.json();
      if (Array.isArray(data)) setProducts(data);
    } catch (e) {
      console.error('Failed to fetch products:', e);
    } finally {
      setLoadingProducts(false);
    }
  };

  // 3. Listen for Establishment Data (Firestore)
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchEstablishmentFallback();
    try {
      const estDocRef = doc(db, 'establishments', storeId);
      const unsubscribe = onSnapshot(estDocRef, (snap) => {
        if (snap.exists()) {
          setEstablishment({ id: snap.id, ...snap.data() } as Establishment);
        } else {
          fetchEstablishmentFallback();
        }
      }, (err) => {
        console.warn('Establishment onSnapshot error (using fallback):', err.message);
        fetchEstablishmentFallback();
      });
      return () => unsubscribe();
    } catch (err) {
      fetchEstablishmentFallback();
    }
  }, [isAuthenticated, storeId]);

  // 4. Synchronize Evolution WhatsApp Status on load and periodically
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const syncEvolutionStatus = async () => {
      try {
        const res = await fetch(`/api/evolution/status?establishmentId=${storeId}`);
        const data = await res.json();
        const isOnline = !!data.connected;
        setEstablishment(prev => {
          if (!prev) return null;
          if (prev.evolutionConnected === isOnline) return prev;
          return { ...prev, evolutionConnected: isOnline };
        });
      } catch (err) {
        console.warn('Could not sync Evolution status:', err);
      }
    };

    syncEvolutionStatus();
    const timer = setInterval(syncEvolutionStatus, 20000);
    return () => clearInterval(timer);
  }, [isAuthenticated, storeId]);

  const fetchEstablishmentFallback = async () => {
    try {
      const res = await fetch(`/api/establishment?establishmentId=${storeId}`);
      const data = await res.json();
      if (data && data.name) {
        setEstablishment({ id: storeId, ...data });
      }
    } catch (e) {
      console.error('Failed to fetch establishment:', e);
    }
  };

  // Actions
  const handleUpdateOrderStatus = async (
    orderId: string, 
    status: OrderStatus, 
    reason?: string,
    courierInfo?: { courierPhone?: string; courierName?: string; saveCourier?: boolean }
  ) => {
    const res = await fetch(`/api/orders/${orderId}/status?establishmentId=${storeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status, 
        rejectionReason: reason, 
        establishmentId: storeId,
        ...courierInfo
      })
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Erro ao atualizar pedido');
    }
  };

  const handleSaveProduct = async (productData: Partial<Product>) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-establishment-id': storeId
      },
      body: JSON.stringify({ ...productData, establishmentId: storeId })
    });
    if (!res.ok) {
      throw new Error('Falha ao salvar produto');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const res = await fetch(`/api/products/${productId}?establishmentId=${storeId}`, {
      method: 'DELETE',
      headers: { 'x-establishment-id': storeId }
    });
    if (!res.ok) {
      throw new Error('Falha ao remover produto');
    }
  };

  const handleSaveEstablishment = async (data: Partial<Establishment>) => {
    const res = await fetch('/api/establishment', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-establishment-id': storeId
      },
      body: JSON.stringify({ ...data, establishmentId: storeId })
    });
    if (!res.ok) {
      throw new Error('Falha ao atualizar dados do estabelecimento');
    }
    setEstablishment(prev => prev ? { ...prev, ...data } : { id: storeId, name: 'Meu Estabelecimento', ...data } as Establishment);
  };

  const handleSignOut = async () => {
    try {
      if (currentUser) {
        await signOut(auth);
      }
      localStorage.removeItem('iapedido_session');
      setSessionUser(null);
      setDemoMode(false);
      setUnauthView('home');
    } catch (err: any) {
      console.error('Error signing out:', err);
    }
  };

  // Show loading screen while checking auth
  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Carregando iaPedido...</p>
      </div>
    );
  }

  if (publicStoreId) {
    return <PublicStorefront storeId={decodeURIComponent(publicStoreId)} />;
  }

  // If user is not authenticated, render Landing Page or Auth View
  if (!isAuthenticated) {
    if (unauthView === 'auth') {
      return (
        <AuthView 
          initialMode={authInitialMode}
          referralCode={referralCode}
          onBackToHome={() => setUnauthView('home')}
          onAuthSuccess={(uid, email) => {
            if (uid === 'default_store') {
              setDemoMode(true);
            } else {
              const userObj = { uid, email };
              try {
                localStorage.setItem('iapedido_session', JSON.stringify(userObj));
              } catch {}
              setSessionUser(userObj);
            }
          }} 
        />
      );
    }

    return (
      <HomeView 
        onGoToAuth={(mode) => {
          setAuthInitialMode(mode);
          setUnauthView('auth');
        }}
        onTryDemo={() => {
          setDemoMode(true);
        }}
      />
    );
  }

  const pendingOrdersCount = orders.filter(o => o.status === 'PENDENTE').length;

  return (
    <SubscriptionGate
      establishment={establishment}
      userEmail={currentUser?.email || sessionUser?.email || (demoMode ? 'demo@burgercia.com.br' : null)}
      onSignOut={handleSignOut}
    >
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
        {/* Sidebar Navigation */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          pendingOrdersCount={pendingOrdersCount}
          isWhatsAppConnected={!!establishment?.evolutionConnected}
          establishment={establishment}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-screen overflow-y-auto">
          <Header
            establishment={establishment}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
            onOpenWhatsApp={() => setCurrentTab('whatsapp')}
            onOpenSettings={() => setCurrentTab('settings')}
            onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
            onOpenMenu={() => setIsMobileDrawerOpen(true)}
            onOpenInstallModal={() => setIsPwaInstallModalOpen(true)}
            userEmail={currentUser?.email || sessionUser?.email || (demoMode ? 'demo@burgercia.com.br' : null)}
            onSignOut={handleSignOut}
          />

          {/* PWA Install & Push Notification Banner */}
          <PwaInstallBanner 
            establishmentId={storeId} 
            onOpenModal={() => setIsPwaInstallModalOpen(true)}
            deferredPrompt={deferredPrompt}
          />

          <main className="flex-1 pb-24 md:pb-16">
            {currentTab === 'orders' && (
              <OrdersView
                orders={orders}
                onUpdateStatus={handleUpdateOrderStatus}
                loading={loadingOrders}
                couriers={establishment?.couriers || []}
                establishmentName={establishment?.name || 'iaPedido'}
                establishment={establishment}
              />
            )}

            {currentTab === 'finance' && (
              <FinanceView
                orders={orders}
                establishment={establishment}
              />
            )}

            {currentTab === 'billing' && (
              <BillingView establishmentId={storeId} email={currentUser?.email || sessionUser?.email} />
            )}

            {currentTab === 'products' && (
              <ProductsView
                products={products}
                establishmentId={storeId}
                onSaveProduct={handleSaveProduct}
                onDeleteProduct={handleDeleteProduct}
                loading={loadingProducts}
                establishment={establishment}
              />
            )}

            {currentTab === 'campaigns' && (
              <CampaignsView
                establishmentId={storeId}
                establishment={establishment}
                onNavigateToWhatsApp={() => setCurrentTab('whatsapp')}
              />
            )}

            {currentTab === 'simulator' && (
              <SimulatorView
                establishmentId={storeId}
                establishment={establishment}
                onOrderCreatedNotification={() => {
                  playNewOrderChime();
                }}
                onNavigateToOrders={() => setCurrentTab('orders')}
              />
            )}

            {currentTab === 'whatsapp' && (
              <WhatsAppView
                establishment={establishment}
                onSaveEstablishment={handleSaveEstablishment}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                establishment={establishment}
                onSaveEstablishment={handleSaveEstablishment}
              />
            )}

          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (Fixed for Phones) */}
      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        pendingOrdersCount={pendingOrdersCount}
        isWhatsAppConnected={!!establishment?.evolutionConnected}
        onOpenDrawer={() => setIsMobileDrawerOpen(true)}
        establishment={establishment}
      />

      {/* Mobile Drawer (Menu Completo para Celular) */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        establishment={establishment}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
        onOpenInstallModal={() => setIsPwaInstallModalOpen(true)}
        userEmail={currentUser?.email || sessionUser?.email || (demoMode ? 'demo@burgercia.com.br' : null)}
        onSignOut={handleSignOut}
      />

      {/* Subscription / Plan Modal */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        establishment={establishment}
        userEmail={currentUser?.email || sessionUser?.email}
      />

      {/* PWA Install Modal (Baixar como App) */}
      <PwaInstallModal
        isOpen={isPwaInstallModalOpen}
        onClose={() => setIsPwaInstallModalOpen(false)}
        deferredPrompt={deferredPrompt}
        establishmentId={storeId}
      />
    </SubscriptionGate>
  );
}
