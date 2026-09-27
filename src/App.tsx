import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from './lib/firebase';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OrdersView } from './components/OrdersView';
import { ProductsView } from './components/ProductsView';
import { SimulatorView } from './components/SimulatorView';
import { WhatsAppView } from './components/WhatsAppView';
import { SettingsView } from './components/SettingsView';
import { Order, Product, Establishment, OrderStatus } from './types';

const STORE_ID = 'default_store';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const prevOrdersCountRef = useRef<number>(0);

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
    try {
      const ordersRef = collection(db, 'establishments', STORE_ID, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedOrders: Order[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Order));

        // Check if a new pending order arrived
        const pendingCount = fetchedOrders.filter(o => o.status === 'PENDENTE').length;
        if (pendingCount > prevOrdersCountRef.current && prevOrdersCountRef.current !== 0) {
          playNewOrderChime();
        }
        prevOrdersCountRef.current = pendingCount;

        setOrders(fetchedOrders);
        setLoadingOrders(false);
      }, (err) => {
        console.error('Firestore Orders onSnapshot error:', err);
        // Fallback to fetch from server API
        fetchOrdersFallback();
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Orders listener setup error:', err);
      fetchOrdersFallback();
    }
  }, [soundEnabled]);

  const fetchOrdersFallback = async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data);
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  // 2. Listen for Products in Real-Time (Firestore)
  useEffect(() => {
    try {
      const productsRef = collection(db, 'establishments', STORE_ID, 'products');
      const unsubscribe = onSnapshot(productsRef, (snapshot) => {
        const fetchedProducts: Product[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Product));
        setProducts(fetchedProducts);
        setLoadingProducts(false);
      }, (err) => {
        console.error('Firestore Products onSnapshot error:', err);
        fetchProductsFallback();
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Products listener setup error:', err);
      fetchProductsFallback();
    }
  }, []);

  const fetchProductsFallback = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error('Failed to fetch products:', e);
    } finally {
      setLoadingProducts(false);
    }
  };

  // 3. Listen for Establishment Data (Firestore)
  useEffect(() => {
    try {
      const estDocRef = doc(db, 'establishments', STORE_ID);
      const unsubscribe = onSnapshot(estDocRef, (snap) => {
        if (snap.exists()) {
          setEstablishment({ id: snap.id, ...snap.data() } as Establishment);
        } else {
          fetchEstablishmentFallback();
        }
      });
      return () => unsubscribe();
    } catch (err) {
      fetchEstablishmentFallback();
    }
  }, []);

  const fetchEstablishmentFallback = async () => {
    try {
      const res = await fetch('/api/establishment');
      const data = await res.json();
      setEstablishment(data);
    } catch (e) {
      console.error('Failed to fetch establishment:', e);
    }
  };

  // Actions
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus, reason?: string) => {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rejectionReason: reason })
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Erro ao atualizar pedido');
    }
  };

  const handleSaveProduct = async (productData: Partial<Product>) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    if (!res.ok) {
      throw new Error('Falha ao salvar produto');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      throw new Error('Falha ao remover produto');
    }
  };

  const handleSaveEstablishment = async (data: Partial<Establishment>) => {
    const res = await fetch('/api/establishment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error('Falha ao atualizar dados do estabelecimento');
    }
    setEstablishment(prev => prev ? { ...prev, ...data } : null);
  };

  const pendingOrdersCount = orders.filter(o => o.status === 'PENDENTE').length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        pendingOrdersCount={pendingOrdersCount}
        isWhatsAppConnected={!!establishment?.evolutionConnected}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <Header
          establishment={establishment}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          onOpenWhatsApp={() => setCurrentTab('whatsapp')}
          onOpenSettings={() => setCurrentTab('settings')}
        />

        <main className="flex-1 pb-16">
          {currentTab === 'orders' && (
            <OrdersView
              orders={orders}
              onUpdateStatus={handleUpdateOrderStatus}
              loading={loadingOrders}
            />
          )}

          {currentTab === 'products' && (
            <ProductsView
              products={products}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              loading={loadingProducts}
            />
          )}

          {currentTab === 'simulator' && (
            <SimulatorView
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
  );
}
