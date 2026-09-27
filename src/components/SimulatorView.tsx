import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  RotateCcw, 
  Sparkles, 
  Smartphone, 
  CheckCheck,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { ChatMessage } from '../types';

interface SimulatorViewProps {
  onOrderCreatedNotification?: () => void;
  onNavigateToOrders: () => void;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  onOrderCreatedNotification,
  onNavigateToOrders
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Olá! Sou a Inteligência Artificial de atendimento do restaurante 🍔! Como posso te ajudar com o cardápio hoje?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [customerName, setCustomerName] = useState('Thiago');
  const [customerPhone, setCustomerPhone] = useState('5511999998888');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isTyping) return;

    const userMessageText = inputText.trim();
    setInputText('');

    const newMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: userMessageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setIsTyping(true);

    try {
      const response = await fetch('/api/simulator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userMessageText,
          phone: customerPhone,
          name: customerName
        })
      });

      const data = await response.json();
      
      const aiReplyMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: data.replyText || 'Entendi!',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        orderId: data.orderCreated?.id
      };

      setMessages(prev => [...prev, aiReplyMsg]);

      if (data.orderCreated) {
        if (onOrderCreatedNotification) onOrderCreatedNotification();
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'system',
          text: 'Erro ao conectar com a IA no servidor. Verifique se o server.ts está rodando.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome_new',
        sender: 'assistant',
        text: 'Olá! Conversa reiniciada. O que você gostaria de pedir hoje?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const samplePrompts = [
    'Quais são os hambúrgueres disponíveis e quanto custam?',
    'Tem alguma sobremesa boa aí?',
    'Vou querer 1 Smash Bacon e 1 Coca Zero para entregar na Av. Paulista 1000 ap 42, vou pagar no PIX, meu nome é Thiago.'
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            Simulador de Atendimento WhatsApp
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Teste em tempo real a conversa da IA, cardápio e fechamento de pedidos como se você fosse um cliente no WhatsApp!
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetChat}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-slate-700/80"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar Chat</span>
          </button>
          <button
            onClick={onNavigateToOrders}
            className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Ver Pedidos no Gestor</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Quick Prompts & Customer Simulated Identity */}
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              Identidade do Cliente Simulado
            </h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nome do Cliente:</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Telefone WhatsApp:</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>
          </div>

          {/* Quick test buttons */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 space-y-3">
            <h4 className="font-bold text-xs text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Frases Rápidas de Teste
            </h4>
            <p className="text-[11px] text-slate-400">
              Clique para preencher o chat e ver como a IA reage:
            </p>
            <div className="space-y-2">
              {samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => setInputText(prompt)}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-800 text-xs text-slate-300 border border-slate-800 transition cursor-pointer hover:border-slate-700"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: WhatsApp Phone Interface */}
        <div className="lg:col-span-2">
          <div className="max-w-xl mx-auto bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[640px]">
            {/* WhatsApp App Header */}
            <div className="bg-slate-900 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
                    <Bot className="w-5 h-5" />
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 absolute bottom-0 right-0 border-2 border-slate-900" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">IA Atendente da Loja</h4>
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                    online agora
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                WhatsApp Webhook
              </span>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-5 overflow-y-auto space-y-3.5 bg-slate-950/95" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const isSystem = msg.sender === 'system';

                if (isSystem) {
                  return (
                    <div key={msg.id} className="text-center my-2">
                      <span className="inline-block bg-slate-900/90 border border-slate-800 text-[11px] text-amber-300 px-3 py-1 rounded-full">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-md whitespace-pre-line ${
                        isUser
                          ? 'bg-emerald-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/60'
                      }`}
                    >
                      {msg.text}

                      {msg.orderId && (
                        <div className="mt-3 pt-2.5 border-t border-slate-700/80 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                            <ShoppingBag className="w-3.5 h-3.5" /> Pedido Registrado no Painel!
                          </span>
                          <button
                            onClick={onNavigateToOrders}
                            className="text-[10px] underline font-bold text-white hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                          >
                            Ver no Gestor <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${isUser ? 'text-emerald-100' : 'text-slate-400'}`}>
                        <span>{msg.timestamp}</span>
                        {isUser && <CheckCheck className="w-3 h-3 text-emerald-200" />}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/60 text-slate-300 px-3.5 py-2 rounded-2xl rounded-bl-none w-28">
                  <span className="text-[11px] text-slate-400">Digitando</span>
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Digite uma mensagem como cliente..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isTyping}
                className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 flex items-center justify-center transition cursor-pointer shadow-md shadow-emerald-500/20"
              >
                <Send className="w-4 h-4 stroke-[2.5]" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
