import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  QrCode, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink, 
  Copy, 
  Send,
  Radio,
  HelpCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { Establishment } from '../types';

interface WhatsAppViewProps {
  establishment: Establishment | null;
  onSaveEstablishment: (data: Partial<Establishment>) => Promise<void>;
}

export const WhatsAppView: React.FC<WhatsAppViewProps> = ({
  establishment,
  onSaveEstablishment
}) => {
  const storeId = establishment?.id || 'default_store';
  const defaultInstName = establishment?.id && establishment.id !== 'default_store' 
    ? `pedidos_${establishment.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}` 
    : 'pedidos_zap';

  const [apiUrl, setApiUrl] = useState(
    establishment?.evolutionApiUrl && establishment.evolutionApiUrl !== 'http://localhost:8080'
      ? establishment.evolutionApiUrl
      : 'http://34.69.146.15:8081'
  );
  const [apiKey, setApiKey] = useState(establishment?.evolutionApiKey || 'minha_chave_secreta_7108');
  const [instanceName, setInstanceName] = useState(establishment?.evolutionInstanceName || defaultInstName);
  
  const [checking, setChecking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionState, setConnectionState] = useState<'open' | 'connecting' | 'close' | 'unknown'>(
    establishment?.evolutionConnected ? 'open' : 'unknown'
  );
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  
  // Test Message Form
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState('Olá! Esta é uma mensagem de teste enviada pela plataforma iaPedido.com via Evolution API! 🚀');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const webhookUrl = `${window.location.origin}/api/webhook/evolution/${storeId}`;
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (establishment) {
      if (establishment.evolutionApiUrl && establishment.evolutionApiUrl !== 'http://localhost:8080') {
        setApiUrl(establishment.evolutionApiUrl);
      } else {
        setApiUrl('http://34.69.146.15:8081');
      }
      if (establishment.evolutionApiKey) {
        setApiKey(establishment.evolutionApiKey);
      } else {
        setApiKey('minha_chave_secreta_7108');
      }
      if (establishment.evolutionInstanceName) {
        setInstanceName(establishment.evolutionInstanceName);
      } else {
        setInstanceName(defaultInstName);
      }
      if (establishment.evolutionConnected) {
        setConnectionState('open');
      }
    }
  }, [establishment, defaultInstName]);

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

  // Check status on component mount
  useEffect(() => {
    checkStatus();
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
      const cleanUrl = (apiUrl || 'http://34.69.146.15:8081').trim();
      const cleanKey = (apiKey || 'minha_chave_secreta_7108').trim();
      const cleanInst = (instanceName || defaultInstName).trim();

      // First save current values
      await onSaveEstablishment({
        evolutionApiUrl: cleanUrl,
        evolutionApiKey: cleanKey,
        evolutionInstanceName: cleanInst
      });

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
      alert('Erro ao conectar instância: ' + err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleResetConnection = async () => {
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
      alert('Erro ao resetar: ' + e.message);
      setConnecting(false);
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
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
          number: testPhone,
          text: testText,
          establishmentId: storeId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: 'Mensagem enviada com sucesso para o WhatsApp!' });
      } else {
        setTestResult({ success: false, message: data.error || data.message || 'Falha ao enviar mensagem.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          Conexão WhatsApp (Evolution API)
          <span className={`w-2.5 h-2.5 rounded-full ${connectionState === 'open' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Integre sua instância da Evolution API para enviar e receber mensagens automaticamente com a Inteligência Artificial.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: API Configuration & Status */}
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                Dados da Instância Evolution API
              </h3>
              <button
                onClick={checkStatus}
                disabled={checking}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                <span>Verificar Status</span>
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">URL do Servidor Evolution API:</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  placeholder="http://localhost:8080 ou https://evolution.seudominio.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Global / Instance API Key:</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Sua chave apikey configurada na Evolution API"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome da Instância:</label>
                <input
                  type="text"
                  value={instanceName}
                  onChange={e => setInstanceName(e.target.value)}
                  placeholder="restaurante_zap"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleConnectInstance}
                  disabled={connecting}
                  className="flex-1 w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{connecting ? 'Gerando QR...' : 'Gerar QR Code'}</span>
                </button>
                <button
                  onClick={handleResetConnection}
                  disabled={connecting}
                  title="Remove a sessão atual no Evolution e recria a instância do zero"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300 text-slate-400 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resetar Sessão</span>
                </button>
              </div>
            </div>

            {/* Connection State Info */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Radio className={`w-4 h-4 ${connectionState === 'open' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
                <div>
                  <p className="text-xs font-bold text-white">Status da Sessão</p>
                  <p className="text-[11px] text-slate-400 capitalize">{connectionState === 'open' ? 'Conectado e Operando' : connectionState}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                connectionState === 'open' 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {connectionState === 'open' ? 'ONLINE' : 'DESCONECTADO'}
              </span>
            </div>
          </div>

          {/* Test WhatsApp Message */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-400" />
              Enviar Mensagem de Teste Direta
            </h3>
            <form onSubmit={handleSendTestMessage} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Número com DDD (ex: 5511999999999):</label>
                <input
                  type="text"
                  required
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="5511988887777"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500/60"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Texto:</label>
                <textarea
                  rows={2}
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500/60"
                />
              </div>
              <button
                type="submit"
                disabled={sendingTest}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingTest ? 'Enviando...' : 'Enviar Teste'}</span>
              </button>

              {testResult && (
                <div className={`p-3 rounded-xl border text-xs ${
                  testResult.success 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {testResult.message}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column: QR Code & Webhook Configuration Guide */}
        <div className="space-y-6">
          {/* QR Code Container */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4">
            <h3 className="font-bold text-sm text-white">QR Code para Conexão</h3>
            
            {qrCodeData ? (
              <div className="p-4 bg-white rounded-2xl shadow-xl flex flex-col items-center">
                <img
                  src={qrCodeData.startsWith('data:image') ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
                  alt="WhatsApp QR Code"
                  className="w-56 h-56 object-contain"
                />
                <div className="mt-3 text-slate-800 space-y-1">
                  <p className="text-[11px] font-bold">
                    Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar Aparelho
                  </p>
                  <p className="text-[10px] text-slate-500">
                    ⏱️ Escaneie rápido (o QR expira em ~20 segundos). A tela conectará automaticamente!
                  </p>
                </div>
                <button
                  onClick={handleConnectInstance}
                  disabled={connecting}
                  className="mt-3 text-[11px] text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer underline"
                >
                  <RefreshCw className={`w-3 h-3 ${connecting ? 'animate-spin' : ''}`} />
                  Renovar QR Code
                </button>
              </div>
            ) : connectionState === 'open' ? (
              <div className="py-12 flex flex-col items-center text-emerald-400 space-y-2">
                <CheckCircle className="w-16 h-16" />
                <h4 className="text-base font-bold text-white">WhatsApp Conectado!</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  Sua instância está ativa e pronta para receber pedidos dos clientes via IA.
                </p>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center text-slate-500 space-y-2">
                <QrCode className="w-16 h-16 stroke-[1.5]" />
                <p className="text-xs text-slate-400 max-w-xs">
                  Clique em "Gerar QR Code" ao lado para escanear com seu celular.
                </p>
              </div>
            )}
          </div>

          {/* Quick Troubleshooting Tip Box */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Erro: "Não foi possível conectar o dispositivo"?</span>
            </div>
            <ul className="text-slate-400 space-y-1 text-[11px] list-disc list-inside">
              <li><strong>Limite de aparelhos:</strong> No celular, vá em <em>Aparelhos Conectados</em> e desconecte qualquer sessão antiga (limite máx: 4).</li>
              <li><strong>Sessão presa:</strong> Clique em <strong>Resetar Sessão</strong> para forçar a exclusão e reiniciar o Baileys do zero.</li>
              <li><strong>Tempo limite:</strong> Escaneie assim que o QR aparecer, pois o WhatsApp invalida o token após 20 segundos.</li>
            </ul>
          </div>

          {/* Webhook Instructions */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Configuração do Webhook na Evolution API
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Para que as mensagens recebidas no WhatsApp cheguem à IA e criem pedidos automaticamente, configure o Webhook na sua instância da Evolution API:
            </p>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">URL do Webhook:</span>
                <button
                  onClick={handleCopyWebhook}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedWebhook ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="font-mono text-xs text-emerald-300 break-all select-all">
                {webhookUrl}
              </p>
            </div>

            <div className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
              <p>📌 <strong>Evento necessário:</strong> <code className="text-slate-200 font-mono">MESSAGES_UPSERT</code></p>
              <p>📌 <strong>Webhook por Instância:</strong> Habilitar no painel da Evolution</p>
              <p>💡 <em>Dica: Se estiver rodando localmente, utilize uma ferramenta como Ngrok ou Cloudflare Tunnel para expor a porta 3001 para a internet!</em></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
