import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  QrCode, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Send,
  RotateCcw,
  Sparkles,
  Users,
  Search,
  UserCheck,
  UserX,
  Trash2,
  ExternalLink,
  ShoppingBag,
  DollarSign,
  Calendar,
  Check,
  Ban,
  Filter
} from 'lucide-react';
import { Establishment } from '../types';

interface WhatsAppViewProps {
  establishment: Establishment | null;
  onSaveEstablishment: (data: Partial<Establishment>) => Promise<void>;
}

interface CustomerContact {
  phone: string;
  name: string;
  ordersCount: number;
  completedOrdersCount: number;
  totalSpent: number;
  lastOrderDate: string;
  isBlocked: boolean;
  blockedAt?: string;
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({
  establishment,
  onSaveEstablishment
}) => {
  const storeId = establishment?.id || 'default_store';
  
  // Tab state: 'connection' or 'contacts'
  const [activeTab, setActiveTab] = useState<'connection' | 'contacts'>('connection');

  // Connection states
  const [checking, setChecking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionState, setConnectionState] = useState<'open' | 'connecting' | 'close' | 'unknown'>(
    establishment?.evolutionConnected ? 'open' : 'unknown'
  );
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  
  // Test Message Form
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState('Olá! Seu WhatsApp está conectado com sucesso e pronto para atender seus clientes automaticamente com Inteligência Artificial! 🚀');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Customer Contacts states
  const [customers, setCustomers] = useState<CustomerContact[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [contactFilter, setContactFilter] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');
  const [togglingPhone, setTogglingPhone] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (establishment?.evolutionConnected) {
      setConnectionState('open');
    }
  }, [establishment?.evolutionConnected]);

  const checkStatus = async () => {
    try {
      setChecking(true);
      const res = await fetch(`/api/evolution/status?establishmentId=${storeId}`);
      const data = await res.json();
      if (data.connected || data.state === 'open') {
        setConnectionState('open');
        setQrCodeData(null);
        if (!establishment?.evolutionConnected) {
          onSaveEstablishment({ evolutionConnected: true }).catch(() => {});
        }
        return true;
      } else {
        setConnectionState(data.state === 'connecting' ? 'connecting' : 'close');
        if (establishment?.evolutionConnected) {
          onSaveEstablishment({ evolutionConnected: false }).catch(() => {});
        }
        return false;
      }
    } catch (err) {
      setConnectionState('close');
      return false;
    } finally {
      setChecking(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const res = await fetch(`/api/customers?establishmentId=${storeId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomers(data);
      }
    } catch (err) {
      console.error('Erro ao carregar lista de contatos:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Check status & fetch customers on mount
  useEffect(() => {
    checkStatus();
    fetchCustomers();
  }, [storeId]);

  // Auto-poll status when QR is showing or state is connecting
  useEffect(() => {
    if (qrCodeData || connectionState === 'connecting') {
      pollTimerRef.current = setInterval(async () => {
        const isConnected = await checkStatus();
        if (isConnected && pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
        }
      }, 3000);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [qrCodeData, connectionState, storeId]);

  const handleConnectInstance = async () => {
    try {
      setConnecting(true);
      const res = await fetch('/api/evolution/connect', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishmentId: storeId })
      });
      const data = await res.json();
      let qr = data.base64 || data.qr || data.code;
      if (qr && typeof qr === 'string' && qr.includes('|')) {
        qr = qr.split('|')[0];
      }

      if (qr) {
        setQrCodeData(qr);
        setConnectionState('connecting');
      } else if (data.connected || data.status === 'connected' || data.state === 'open') {
        setConnectionState('open');
        setQrCodeData(null);
      } else if (data.message || data.error) {
        alert(data.message || data.error);
      }
    } catch (err: any) {
      alert('Não foi possível gerar o QR Code no momento: ' + err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleResetConnection = async () => {
    if (!window.confirm('Deseja desconectar o aparelho atual e gerar uma nova conexão?')) return;
    try {
      setConnecting(true);
      await fetch('/api/evolution/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishmentId: storeId })
      });
      setQrCodeData(null);
      setConnectionState('close');
      await handleConnectInstance();
    } catch (e: any) {
      alert('Erro ao reiniciar: ' + e.message);
      setConnecting(false);
    }
  };

  const handleToggleBlockContact = async (contact: CustomerContact) => {
    try {
      setTogglingPhone(contact.phone);
      const res = await fetch('/api/customers/toggle-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contact.phone,
          establishmentId: storeId
        })
      });
      const data = await res.json();
      if (res.ok) {
        setCustomers(prev => prev.map(c => 
          c.phone === contact.phone ? { ...c, isBlocked: data.isBlocked } : c
        ));
      }
    } catch (err: any) {
      alert('Erro ao alterar status do contato: ' + err.message);
    } finally {
      setTogglingPhone(null);
    }
  };

  const handleRemoveContact = async (phone: string, name: string) => {
    if (!window.confirm(`Deseja remover "${name || phone}" da lista de disparos de campanhas?`)) return;
    try {
      setTogglingPhone(phone);
      const res = await fetch(`/api/customers/${phone}?establishmentId=${storeId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setCustomers(prev => prev.map(c => 
          c.phone === phone ? { ...c, isBlocked: true } : c
        ));
      }
    } catch (err: any) {
      alert('Erro ao remover contato: ' + err.message);
    } finally {
      setTogglingPhone(null);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;

    try {
      setSendingTest(true);
      setTestResult(null);

      const res = await fetch('/api/evolution/test-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: testPhone.replace(/\D/g, ''),
          text: testText,
          establishmentId: storeId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: 'Mensagem de teste enviada com sucesso para o seu WhatsApp!' });
      } else {
        setTestResult({ success: false, message: data.error || data.message || 'Falha ao enviar mensagem de teste.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setSendingTest(false);
    }
  };

  const isOnline = connectionState === 'open';

  // Filtered customer contacts
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.phone.includes(searchTerm.replace(/\D/g, ''));
    
    if (!matchesSearch) return false;
    if (contactFilter === 'ACTIVE') return !c.isBlocked;
    if (contactFilter === 'BLOCKED') return c.isBlocked;
    return true;
  });

  const activeAudienceCount = customers.filter(c => !c.isBlocked).length;
  const blockedAudienceCount = customers.filter(c => c.isBlocked).length;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-8 animate-in fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              WhatsApp & Clientes
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
            </h2>
            <span className={`text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full border ${
              isOnline 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {isOnline ? 'Conectado e Operando' : 'Desconectado'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Conexão com seu smartphone e gerenciamento da base de clientes que já fizeram e receberam pedidos.
          </p>
        </div>

        {/* Navigation Tabs (Connection vs Contacts) */}
        <div className="bg-slate-900 border border-slate-800 p-1 rounded-2xl flex items-center gap-1 self-start sm:self-auto shadow-sm -mx-3 px-3 sm:mx-0 sm:px-1 overflow-x-auto scrollbar-none w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('connection')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap flex-1 sm:flex-initial ${
              activeTab === 'connection'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Aparelho WhatsApp</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('contacts');
              fetchCustomers();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap flex-1 sm:flex-initial ${
              activeTab === 'contacts'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Base de Clientes ({activeAudienceCount})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: CONNECTION & QR CODE */}
      {activeTab === 'connection' && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in">
          {isOnline ? (
            /* CONNECTED STATE */
            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-4 sm:p-6 lg:p-8 space-y-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20 shrink-0">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white">WhatsApp Conectado com Sucesso!</h3>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                        ONLINE
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 max-w-xl">
                      Seu número está sincronizado. A Inteligência Artificial está atendendo mensagens de texto, áudios e registrando pedidos dos clientes no seu painel.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={handleResetConnection}
                    disabled={connecting}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 text-slate-300 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition cursor-pointer"
                    title="Desconectar e conectar outro número"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Trocar ou Reconectar Aparelho</span>
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                  <span className="text-slate-400">Atendimento Automático:</span>
                  <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Ativo para todos os clientes
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                  <span className="text-slate-400">Reconhecimento de Áudio:</span>
                  <p className="font-bold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-400" /> Compreende mensagens de voz
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                  <span className="text-slate-400">Cardápio com Fotos:</span>
                  <p className="font-bold text-blue-300 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-blue-400" /> Envio automático de fotos dos pratos
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* DISCONNECTED / CONNECTING STATE */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Instructions Step-by-Step (7 cols) */}
              <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 lg:p-7 space-y-6 backdrop-blur-md">
                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-white flex items-center gap-2.5">
                    <Smartphone className="w-5 h-5 text-emerald-400" />
                    Como conectar seu WhatsApp
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Siga os 3 passos simples abaixo usando o smartphone do seu estabelecimento:
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Step 1 */}
                  <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-sm flex items-center justify-center shrink-0 border border-emerald-500/30">
                      1
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-sm text-white">Abra o WhatsApp no seu celular</h4>
                      <p className="text-xs text-slate-400">
                        Abra o aplicativo oficial do WhatsApp ou WhatsApp Business da loja.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-sm flex items-center justify-center shrink-0 border border-emerald-500/30">
                      2
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-sm text-white">Acesse Aparelhos Conectados</h4>
                      <p className="text-xs text-slate-400">
                        Toque nos <strong>três pontinhos</strong> (no Android) ou em <strong>Configurações</strong> (no iPhone) e escolha a opção <strong>"Aparelhos conectados"</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-sm flex items-center justify-center shrink-0 border border-emerald-500/30">
                      3
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-sm text-white">Toque em "Conectar um Aparelho"</h4>
                      <p className="text-xs text-slate-400">
                        Aponte a câmera para o <strong>QR Code</strong> exibido ao lado. A conexão será feita na hora!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Generate QR Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    onClick={handleConnectInstance}
                    disabled={connecting}
                    className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2.5 transition cursor-pointer shadow-xl shadow-emerald-500/20"
                  >
                    <QrCode className="w-5 h-5" />
                    <span>{connecting ? 'Gerando QR Code...' : 'Gerar QR Code para Conectar'}</span>
                  </button>

                  <button
                    onClick={handleResetConnection}
                    disabled={connecting}
                    className="w-full sm:w-auto py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer border border-slate-700 flex items-center justify-center gap-2"
                    title="Limpar qualquer tentativa anterior e recomeçar"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reiniciar Conexão</span>
                  </button>
                </div>
              </div>

              {/* QR Code Presentation Box (5 cols) */}
              <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 lg:p-7 flex flex-col items-center justify-center text-center space-y-4 backdrop-blur-md min-h-[420px]">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  Escanear com o Celular
                </h3>

                {qrCodeData ? (
                  <div className="p-5 bg-white rounded-3xl shadow-2xl flex flex-col items-center animate-in fade-in">
                    <img
                      src={qrCodeData.startsWith('data:image') ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
                      alt="QR Code WhatsApp"
                      className="w-64 h-64 object-contain"
                    />
                    <div className="mt-3 text-slate-800 space-y-1">
                      <p className="text-xs font-bold text-emerald-800">
                        Aguardando leitura pelo WhatsApp...
                      </p>
                      <p className="text-[11px] text-slate-500">
                        ⏱️ Escaneie rápido. A tela conecta sozinha assim que você ler!
                      </p>
                    </div>

                    <button
                      onClick={handleConnectInstance}
                      disabled={connecting}
                      className="mt-3 text-xs text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer underline"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
                      Atualizar QR Code
                    </button>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center text-slate-400 space-y-4">
                    <div className="w-24 h-24 rounded-3xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 shadow-inner">
                      <QrCode className="w-12 h-12 stroke-[1.2]" />
                    </div>
                    <div className="space-y-1 max-w-xs">
                      <p className="text-sm font-bold text-white">Nenhum QR Code gerado ainda</p>
                      <p className="text-xs text-slate-400">
                        Clique no botão verde <strong>"Gerar QR Code para Conectar"</strong> ao lado para exibir o código.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Test Message Module (Clean & Simple) */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-7 space-y-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Testar Envio de Mensagem</h3>
                <p className="text-xs text-slate-400">
                  Envie uma mensagem de teste para o seu próprio celular para confirmar que o WhatsApp está entregando perfeitamente.
                </p>
              </div>
            </div>

            <form onSubmit={handleSendTestMessage} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pt-2">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Seu Telefone com DDD:
                </label>
                <input
                  type="text"
                  required
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="Ex: 558199439478 ou 11988887777"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mensagem de Teste:
                </label>
                <input
                  type="text"
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={sendingTest || !isOnline}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{sendingTest ? 'Enviando...' : 'Enviar Mensagem Teste'}</span>
                </button>
              </div>

              {testResult && (
                <div className={`md:col-span-12 p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                  testResult.success 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMERS & AUDIENCE LIST */}
      {activeTab === 'contacts' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Clientes com Pedidos</span>
              <div className="mt-2 text-2xl font-black text-white">{customers.length}</div>
              <p className="text-xs text-slate-400 mt-0.5">Contatos que já compraram na loja</p>
            </div>

            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-5 backdrop-blur-sm">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Ativos para Disparos</span>
              <div className="mt-2 text-2xl font-black text-emerald-400">{activeAudienceCount}</div>
              <p className="text-xs text-slate-400 mt-0.5">Receberão os disparos agendados</p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Removidos / Bloqueados</span>
              <div className="mt-2 text-2xl font-black text-rose-400">{blockedAudienceCount}</div>
              <p className="text-xs text-slate-400 mt-0.5">Não receberão mensagens de marketing</p>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 space-y-4 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar cliente por nome ou número de telefone..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setContactFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    contactFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({customers.length})
                </button>
                <button
                  onClick={() => setContactFilter('ACTIVE')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    contactFilter === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Ativos ({activeAudienceCount})
                </button>
                <button
                  onClick={() => setContactFilter('BLOCKED')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    contactFilter === 'BLOCKED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Removidos ({blockedAudienceCount})
                </button>
              </div>

              <button
                onClick={fetchCustomers}
                disabled={loadingCustomers}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${loadingCustomers ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>

            {/* Contacts Table */}
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3">Cliente</th>
                    <th className="pb-3">WhatsApp</th>
                    <th className="pb-3">Pedidos Concluídos</th>
                    <th className="pb-3">Total Gasto</th>
                    <th className="pb-3">Último Pedido</th>
                    <th className="pb-3">Status de Disparo</th>
                    <th className="pb-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredCustomers.map((contact) => (
                    <tr key={contact.phone} className="hover:bg-slate-800/30 transition">
                      {/* Name */}
                      <td className="py-3.5 font-bold text-white flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] text-emerald-400 font-bold shrink-0">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{contact.name}</span>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 font-mono text-slate-300">
                        <a
                          href={`https://wa.me/${contact.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          +{contact.phone}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      </td>

                      {/* Orders Count */}
                      <td className="py-3.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-950 border border-slate-800 font-semibold text-slate-200">
                          <ShoppingBag className="w-3 h-3 text-emerald-400" />
                          {contact.completedOrdersCount || contact.ordersCount} pedido(s)
                        </span>
                      </td>

                      {/* Total Spent */}
                      <td className="py-3.5 font-mono font-bold text-emerald-400">
                        R$ {contact.totalSpent.toFixed(2)}
                      </td>

                      {/* Last Order Date */}
                      <td className="py-3.5 text-slate-400 text-[11px]">
                        {new Date(contact.lastOrderDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>

                      {/* Broadcast Status */}
                      <td className="py-3.5">
                        {contact.isBlocked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            <Ban className="w-3 h-3" />
                            Removido dos Disparos
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Ativo para Campanhas
                          </span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 text-right">
                        {contact.isBlocked ? (
                          <button
                            onClick={() => handleToggleBlockContact(contact)}
                            disabled={togglingPhone === contact.phone}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px] inline-flex items-center gap-1.5 transition cursor-pointer"
                            title="Reativar para receber mensagens promocionais"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Reativar</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRemoveContact(contact.phone, contact.name)}
                            disabled={togglingPhone === contact.phone}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[11px] inline-flex items-center gap-1.5 transition cursor-pointer"
                            title="Remover da lista para não receber disparos agendados"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Remover dos Disparos</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500 space-y-2">
                        <Users className="w-8 h-8 mx-auto opacity-40" />
                        <p className="text-xs">
                          {searchTerm 
                            ? 'Nenhum contato encontrado para a busca.' 
                            : 'Nenhum cliente com pedidos finalizados ainda.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
