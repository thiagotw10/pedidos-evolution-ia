import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  Smartphone, 
  Zap, 
  ArrowRight, 
  CheckCircle2, 
  ShoppingBag, 
  TrendingUp, 
  Users, 
  Clock, 
  ShieldCheck, 
  DollarSign, 
  Star, 
  ChevronRight, 
  Volume2, 
  MessageSquare, 
  Image as ImageIcon, 
  Megaphone, 
  Award, 
  Coffee, 
  Flame 
} from 'lucide-react';
import { PLAN_TIER_LIST } from '../utils/subscription';

interface HomeViewProps {
  onGoToAuth: (mode: 'login' | 'register') => void;
  onTryDemo?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onGoToAuth }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeMockupNiche, setActiveMockupNiche] = useState<'VEHICLES' | 'REAL_ESTATE' | 'FASHION' | 'FOOD'>('VEHICLES');

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      q: 'A plataforma serve para qualquer tipo de produto ou segmento?',
      a: 'Sim! A plataforma atende com perfeição tanto estabelecimentos de alimentação (restaurantes, hamburguerias, pizzarias) quanto concessionárias de carros e motos, imobiliárias, lojas de roupas, celulares/eletrônicos, autopeças e comércio em geral. A IA se adapta com as fotos e termos do seu nicho!'
    },
    {
      q: 'Preciso deixar um computador ligado o dia inteiro?',
      a: 'Não! O sistema roda 100% na nuvem. Depois de escanear o QR Code ou digitar o código de pareamento pelo seu smartphone, o atendimento por Inteligência Artificial continua funcionando 24h por dia, mesmo com o computador desligado.'
    },
    {
      q: 'Funciona com o WhatsApp Business ou número comum?',
      a: 'Sim, funciona perfeitamente tanto no WhatsApp Business quanto no WhatsApp normal. Você usa o próprio número de telefone da sua empresa sem precisar trocar.'
    },
    {
      q: 'A Inteligência Artificial realmente entende áudios dos clientes?',
      a: 'Sim! Nossa IA escuta os áudios enviados pelos clientes, transcreve com precisão, identifica os itens pedidos ou veículos/imóveis de interesse, quantidades e observações, e cadastra tudo no seu painel.'
    },
    {
      q: 'Vocês cobram porcentagem ou comissão sobre as minhas vendas?',
      a: 'Zero porcento! Ao contrário de marketplaces tradicionais que chegam a cobrar 27% por pedido ou lead, na nossa plataforma 100% do valor das suas vendas e propostas fica com você.'
    },
    {
      q: 'Como funcionam os disparos de campanhas e novidades?',
      a: 'Você configura um template com a foto do seu produto/veículo e o texto promocional. O sistema pode disparar para quem já comprou com você ou para grupos do WhatsApp que você participa, atraindo novos compradores de imediato!'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950 relative overflow-x-hidden">
      {/* Background Glow Accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-emerald-500/15 via-teal-500/5 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[800px] -right-40 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* 1. Header / Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/25 ring-1 ring-white/20 shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-slate-950" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-lg sm:text-xl text-white tracking-tight">ia<span className="text-emerald-400">Pedido</span></span>
              </div>
              <p className="hidden sm:block text-[10px] text-slate-400 font-medium tracking-wide">WhatsApp & Inteligência Artificial</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-300">
            <a href="#recursos" className="hover:text-emerald-400 transition">Recursos</a>
            <a href="#planos" className="hover:text-emerald-400 transition">Planos</a>
            <a href="#comparativo" className="hover:text-emerald-400 transition">Vantagens</a>
            <a href="#depoimentos" className="hover:text-emerald-400 transition">Depoimentos</a>
            <a href="#faq" className="hover:text-emerald-400 transition">Dúvidas</a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <button
              onClick={() => onGoToAuth('login')}
              className="px-2 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition cursor-pointer whitespace-nowrap"
            >
              Entrar
            </button>

            <button
              onClick={() => onGoToAuth('register')}
              className="px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-[11px] sm:text-xs flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
            >
              <span className="sm:hidden">Criar grátis</span>
              <span className="hidden sm:inline">Criar Conta Grátis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="pt-16 pb-24 px-6 max-w-7xl mx-auto text-center space-y-10 relative">
        {/* Social Proof Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-medium text-slate-300 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>Mais de <strong>50.000 pedidos</strong> atendidos via IA</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> 0% de Comissões
          </span>
        </div>

        {/* Main Headline */}
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.08]">
            Transforme o WhatsApp do seu Negócio em uma{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Máquina de Vendas 24h
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Atenda clientes instantaneamente, apresente catálogos com fotos (veículos, imóveis, roupas, lanches e eletrônicos), tire dúvidas por áudio ou texto e dispare campanhas em massa no WhatsApp.
          </p>
        </div>

        {/* Niche Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto pt-1">
          <span className="px-3 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-xs text-orange-300 font-semibold flex items-center gap-1.5 shadow-sm">
            🏁 Performance & Escapamentos 3D
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-semibold flex items-center gap-1.5 shadow-sm">
            🚗 Veículos & Concessionárias
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-semibold flex items-center gap-1.5 shadow-sm">
            🏠 Imóveis & Corretores
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-semibold flex items-center gap-1.5 shadow-sm">
            👗 Moda & Boutiques
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-semibold flex items-center gap-1.5 shadow-sm">
            📱 Celulares & Eletrônicos
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-semibold flex items-center gap-1.5 shadow-sm">
            🍔 Restaurantes & Delivery
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-semibold flex items-center gap-1.5 shadow-sm">
            📦 Comércio & Varejo Geral
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <button
            onClick={() => onGoToAuth('register')}
            className="w-full sm:w-auto px-9 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2.5 shadow-2xl shadow-emerald-500/30 transition cursor-pointer transform hover:-translate-y-1"
          >
            <Sparkles className="w-4 h-4" />
            <span>Criar Conta & Começar Grátis</span>
          </button>
        </div>

        {/* Trust Badges */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-medium">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Sem necessidade de cartão de crédito</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Configure e conecte em 3 minutos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Funciona no seu número atual</span>
          </div>
        </div>

        {/* 3. Interactive Mockup: Live WhatsApp Experience Preview */}
        <div className="pt-8 max-w-4xl mx-auto space-y-4">
          {/* Interactive Niche Tabs */}
          <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {[
              { id: 'VEHICLES' as const, label: '🚗 Concessionária / Carros', badge: 'Veículos' },
              { id: 'REAL_ESTATE' as const, label: '🏠 Imobiliária / Imóveis', badge: 'Imóveis' },
              { id: 'FASHION' as const, label: '👗 Moda / Roupas', badge: 'Moda' },
              { id: 'FOOD' as const, label: '🍔 Alimentação / Delivery', badge: 'Delivery' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMockupNiche(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeMockupNiche === tab.id
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25'
                    : 'bg-slate-900/90 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl p-5 md:p-8 relative overflow-hidden backdrop-blur-md">
            {/* Window Top Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                <span className="ml-2 font-mono text-slate-300 hidden sm:inline">Simulação de Atendimento WhatsApp em Tempo Real</span>
              </div>
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                IA Online Respondendo 24h
              </span>
            </div>

            {/* Simulated Chat Dialogue */}
            <div className="space-y-4 max-w-2xl mx-auto text-left text-xs leading-relaxed animate-fadeIn">
              {/* Message 1: Customer asks */}
              <div className="flex justify-end">
                <div className="bg-emerald-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 max-w-xs shadow-md">
                  {activeMockupNiche === 'VEHICLES' && 'Boa tarde! Vocês têm algum sedã premium disponível para pronta entrega?'}
                  {activeMockupNiche === 'REAL_ESTATE' && 'Olá! Vocês têm apartamento de 2 ou 3 quartos para alugar ou comprar no Centro?'}
                  {activeMockupNiche === 'FASHION' && 'Boa tarde! Vocês têm vestidos ou novidades da nova coleção no tamanho M?'}
                  {activeMockupNiche === 'FOOD' && 'Boa noite! O que vocês tem de lanche hoje? Pode me mandar o cardápio?'}
                  <span className="block text-[10px] text-emerald-200/80 text-right mt-1 font-mono">15:42</span>
                </div>
              </div>

              {/* Message 2: Bot sends photo with caption */}
              <div className="flex justify-start">
                <div className="bg-slate-800 text-slate-100 rounded-2xl rounded-tl-none p-3 max-w-sm border border-slate-700/80 shadow-md space-y-2">
                  <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-700/60 aspect-[16/10] w-full">
                    <img 
                      src={
                        activeMockupNiche === 'VEHICLES'
                          ? 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=800&h=500&q=80'
                          : activeMockupNiche === 'REAL_ESTATE'
                          ? 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&h=500&q=80'
                          : activeMockupNiche === 'FASHION'
                          ? 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=800&h=500&q=80'
                          : 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&h=500&q=80'
                      } 
                      alt="Item Catálogo" 
                      className="w-full h-full object-cover object-center" 
                    />
                  </div>
                  <div>
                    {activeMockupNiche === 'VEHICLES' && (
                      <>
                        <p className="font-bold text-white text-xs">🚗 *BMW 320i M Sport 2.0 Turbo* - R$ 189.900</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">Ano 2021, 42.000 km, bancos em couro, faróis Full LED, rodas aro 19, teto solar e laudo cautelar 100% aprovado.</p>
                      </>
                    )}
                    {activeMockupNiche === 'REAL_ESTATE' && (
                      <>
                        <p className="font-bold text-white text-xs">🏡 *Apartamento 3 Quartos c/ Suíte* - R$ 2.400/mês</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">85m² privativos, varanda gourmet com churrasqueira, 2 vagas cobertas e condomínio completo.</p>
                      </>
                    )}
                    {activeMockupNiche === 'FASHION' && (
                      <>
                        <p className="font-bold text-white text-xs">👗 *Vestido Casual Branco em Laise* - R$ 189.90</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">Modelagem ombro a ombro com babados e caimento impecável. Tecido 100% algodão nos tamanhos P, M e G.</p>
                      </>
                    )}
                    {activeMockupNiche === 'FOOD' && (
                      <>
                        <p className="font-bold text-white text-xs">🍽️ *Hambúrguer Artesanal Cheddar* - R$ 29.90</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">Blend 180g, muito queijo cheddar cremoso e cebola caramelizada no pão brioche.</p>
                      </>
                    )}
                  </div>
                  <span className="block text-[10px] text-slate-400 text-right font-mono">15:42</span>
                </div>
              </div>

              {/* Message 3: Customer sends Audio */}
              <div className="flex justify-end">
                <div className="bg-emerald-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-xs shadow-md flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
                      <div className="w-2/3 h-full bg-white rounded-full"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-emerald-100 font-mono">
                      <span>
                        {activeMockupNiche === 'VEHICLES' ? '0:11' : activeMockupNiche === 'REAL_ESTATE' ? '0:07' : activeMockupNiche === 'FASHION' ? '0:06' : '0:08'}
                      </span>
                      <span>Mensagem de Áudio</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Message 4: Bot confirms audio extraction and registers proposal/order */}
              <div className="flex justify-start">
                <div className="bg-slate-800 text-slate-100 rounded-2xl rounded-tl-none p-3.5 max-w-md border border-slate-700/80 shadow-md space-y-2">
                  <div className="text-xs">
                    {activeMockupNiche === 'VEHICLES' && (
                      <p>
                        Perfeito, Thiago! Aceitamos seu carro na troca com avaliação justa e conseguimos simular o saldo em até 48x!<br />
                        • <strong>Veículo de Interesse:</strong> BMW 320i M Sport 2021<br />
                        • <strong>Condição:</strong> Simulação de Financiamento + Troca<br />
                        • <strong>Atendimento:</strong> Agendamento de Visita & Test-Drive
                      </p>
                    )}
                    {activeMockupNiche === 'REAL_ESTATE' && (
                      <p>
                        Perfeito, Thiago! O condomínio possui portaria 24h e aceitamos caução ou fiador.<br />
                        • <strong>Imóvel:</strong> Apto 3 Quartos Jardins (Cód. 804)<br />
                        • <strong>Visita:</strong> Amanhã às 14:30 com o corretor responsável<br />
                        • <strong>Status:</strong> Visita Agendada
                      </p>
                    )}
                    {activeMockupNiche === 'FASHION' && (
                      <p>
                        Amei sua escolha, Thiago! Já separamos 1 peça no tamanho M.<br />
                        • <strong>1x Vestido Casual Branco em Laise</strong> (Tamanho: M)<br />
                        • <strong>Entrega:</strong> Motoboy Express (em até 2 horas)<br />
                        • <strong>Pagamento:</strong> PIX com 5% de desconto
                      </p>
                    )}
                    {activeMockupNiche === 'FOOD' && (
                      <p>
                        Perfeito, Thiago! Anotei seu pedido:<br />
                        • <strong>2x Hambúrguer Artesanal Cheddar</strong> (sem salada)<br />
                        • <strong>Entrega:</strong> Rua das Flores, 120 - Centro<br />
                        • <strong>Pagamento:</strong> PIX
                      </p>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 
                      {activeMockupNiche === 'VEHICLES' && 'Proposta #408 Registrada no Painel!'}
                      {activeMockupNiche === 'REAL_ESTATE' && 'Lead #302 Registrado no Painel!'}
                      {activeMockupNiche === 'FASHION' && 'Sacola #215 Registrada no Painel!'}
                      {activeMockupNiche === 'FOOD' && 'Pedido #102 Registrado no Painel!'}
                    </span>
                    <span className="font-mono font-bold text-white">
                      {activeMockupNiche === 'VEHICLES' && 'Valor: R$ 189.900'}
                      {activeMockupNiche === 'REAL_ESTATE' && 'Aluguel: R$ 2.400'}
                      {activeMockupNiche === 'FASHION' && 'Total: R$ 180.40'}
                      {activeMockupNiche === 'FOOD' && 'Total: R$ 66.80'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Core Features Section */}
      <section id="recursos" className="py-24 px-6 max-w-7xl mx-auto border-t border-slate-800/60 space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            Funcionalidades Exclusivas
          </span>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Tudo o que seu Negócio precisa em uma só plataforma
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            Chega de perder clientes e vendas porque o atendente demorou para responder ou passou informações incompletas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4 hover:border-slate-700 transition">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Volume2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">IA que Entende Mensagens de Áudio</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mais de 60% dos clientes preferem mandar áudio no WhatsApp. Nossa IA escuta os áudios, extrai os itens, quantidades e todas as observações com perfeição.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4 hover:border-slate-700 transition">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">Catálogo & Fotos Reais no WhatsApp</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              O cliente compra com os olhos! Ao pedir opções, a IA envia fotos individuais dos produtos, veículos ou imóveis com valor e especificações, aumentando as conversões.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4 hover:border-slate-700 transition">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Megaphone className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">Disparos e Campanhas em Massa</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dispare ofertas e novidades agendadas para seus clientes ou grupos do WhatsApp no horário de maior pico de compras do seu comércio.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4 hover:border-slate-700 transition">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">Gestor de Pedidos & Propostas</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Painel com avisos sonoros instantâneos. Alterne status (Em atendimento, Proposta enviada, Concluído ou Agendado) com 1 clique e notifique o cliente no WhatsApp.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4 hover:border-slate-700 transition">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">Painel Financeiro & Projeções</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Acompanhe seu faturamento diário, ticket médio, divisão entre PIX e cartões, produtos mais lucrativos e projeção de faturamento até o fim do mês.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4 hover:border-slate-700 transition">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-white">Controle da Base de Clientes</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              A lista completa de contatos que já compraram ou solicitaram atendimento com você fica gravada. Tenha a liberdade de gerenciar quem deve receber seus disparos automáticos.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Comparison: iaPedido vs Marketplaces */}
      <section id="comparativo" className="py-24 px-6 max-w-5xl mx-auto border-t border-slate-800/60 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            Economia Real
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Por que migrar suas vendas para o seu próprio WhatsApp?
          </h2>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                  <th className="py-4 px-6 font-semibold">Comparativo de Benefícios</th>
                  <th className="py-4 px-6 font-bold text-emerald-400 text-center bg-emerald-500/10">iaPedido</th>
                  <th className="py-4 px-6 font-semibold text-slate-400 text-center">Portais e Marketplaces de Terceiros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-4 px-6 font-medium">Comissão sobre suas vendas</td>
                  <td className="py-4 px-6 text-center font-black text-emerald-400 bg-emerald-500/5">0% (Sem comissões)</td>
                  <td className="py-4 px-6 text-center text-rose-400 font-semibold">12% a 27% ou taxas caras por lead</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium">Base de clientes e WhatsApp</td>
                  <td className="py-4 px-6 text-center font-bold text-emerald-400 bg-emerald-500/5">100% sua para sempre</td>
                  <td className="py-4 px-6 text-center text-slate-500">Pertence ao app, você não tem o contato direto</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium">Atendimento humanizado com IA e Áudio</td>
                  <td className="py-4 px-6 text-center font-bold text-emerald-400 bg-emerald-500/5">Sim, escuta áudios e envia fotos</td>
                  <td className="py-4 px-6 text-center text-slate-500">Não (apenas links estáticos ou chatbots frios)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium">Disparos de novidades para clientes e grupos</td>
                  <td className="py-4 px-6 text-center font-bold text-emerald-400 bg-emerald-500/5">Ilimitado e agendado</td>
                  <td className="py-4 px-6 text-center text-slate-500">Cobram caro por anúncios patrocinados</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-medium">Recebimento do dinheiro</td>
                  <td className="py-4 px-6 text-center font-bold text-emerald-400 bg-emerald-500/5">Direto na sua conta (PIX instantâneo)</td>
                  <td className="py-4 px-6 text-center text-slate-400">Repasse demorado com descontos</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. Testimonials Section */}
      <section id="depoimentos" className="py-24 px-6 max-w-7xl mx-auto border-t border-slate-800/60 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            Resultados Comprovados
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            O que empresários de diferentes segmentos dizem
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4">
            <div className="flex items-center gap-1 text-amber-400">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400" />)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              "No sábado à noite nosso WhatsApp travava com mais de 30 clientes esperando ao mesmo tempo. Hoje a IA responde em 2 segundos e manda o pedido pronto para a equipe. Dobramos o faturamento!"
            </p>
            <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                M
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Marcelo Rios</h4>
                <p className="text-[11px] text-slate-400">Burgers & Cia • Recife/PE</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4">
            <div className="flex items-center gap-1 text-amber-400">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400" />)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              "O recurso de entender áudio e enviar fotos dos vestidos no WhatsApp é surreal. As clientes perguntam se tem tamanho M e a IA manda a foto no corpo e o link de pagamento. Nossas vendas dispararam!"
            </p>
            <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center text-xs">
                C
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Carla Vasconcelos</h4>
                <p className="text-[11px] text-slate-400">La Belle Boutique & Moda • Belo Horizonte/MG</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-7 space-y-4">
            <div className="flex items-center gap-1 text-amber-400">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400" />)}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              "Recebemos dezenas de mensagens por dia querendo saber estoque de veículos e financiamento. A IA responde de madrugada com fotos dos carros e já agenda a visita para o test-drive. Excelente!"
            </p>
            <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-300 font-bold flex items-center justify-center text-xs">
                R
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Rodrigo Mendes</h4>
                <p className="text-[11px] text-slate-400">Prime Motors & Veículos • Goiânia/GO</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6.5 Pricing & Plans Section */}
      <section id="planos" className="py-24 px-6 max-w-7xl mx-auto border-t border-slate-800/60 space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            Planos & Investimento
          </span>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Planos sob medida para o porte e ticket do seu negócio
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            Todos os planos incluem <strong>7 dias de teste grátis</strong>, <strong>0% de comissão</strong> sobre suas vendas e <strong>franquia mensal de créditos de IA</strong> já inclusa.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {PLAN_TIER_LIST.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl p-7 border flex flex-col justify-between transition ${
                plan.highlighted
                  ? 'bg-slate-900 border-emerald-500/60 shadow-2xl shadow-emerald-950/30 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    {plan.name}
                  </span>
                  {plan.badge && (
                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                        plan.highlighted
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                      }`}
                    >
                      {plan.badge}
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black text-white">R$ {plan.price}</span>
                  <span className="text-xs text-slate-400 font-semibold">/ mês</span>
                </div>

                <p className="text-xs text-emerald-300 font-bold mt-2">
                  + R$ {plan.includedCredits},00 em créditos IA/mês ({plan.estimatedInteractions})
                </p>
                <p className="text-xs text-slate-400 mt-1">{plan.targetAudience}</p>

                {plan.setupFeeOptional && (
                  <div className="mt-3 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/25 text-[11px] text-orange-300 font-semibold">
                    Setup de Implantação 3D & Catálogo (opcional): R$ {plan.setupFeeOptional}
                  </div>
                )}

                <ul className="mt-6 space-y-3 border-t border-slate-800 pt-5 text-xs text-slate-300">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => onGoToAuth('register')}
                className={`mt-7 w-full py-3.5 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                  plan.highlighted
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-500/25'
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                }`}
              >
                <span>Testar 7 Dias Grátis no {plan.name}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section id="faq" className="py-24 px-6 max-w-4xl mx-auto border-t border-slate-800/60 space-y-10">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            Tira Dúvidas
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Perguntas Frequentes
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div 
              key={idx}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden transition"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer"
              >
                <span className="font-bold text-sm text-white">{faq.q}</span>
                <ChevronRight className={`w-4 h-4 text-emerald-400 transition-transform duration-200 shrink-0 ${openFaq === idx ? 'rotate-90' : ''}`} />
              </button>
              {openFaq === idx && (
                <div className="px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 8. Final CTA Section */}
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <div className="bg-gradient-to-tr from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/30 rounded-3xl p-10 sm:p-16 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-7 h-7" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight max-w-2xl mx-auto">
            Pronto para colocar o WhatsApp da sua empresa no piloto automático?
          </h2>

          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Crie sua conta agora mesmo. Em menos de 3 minutos seu catálogo ou estoque estará configurado e sua IA estará pronta para vender.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onGoToAuth('register')}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-2xl shadow-emerald-500/30 transition cursor-pointer transform hover:-translate-y-0.5"
            >
              <span>Começar Gratuitamente</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onGoToAuth('login')}
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold border border-slate-800 transition cursor-pointer"
            >
              Já tenho uma conta
            </button>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="border-t border-slate-800/80 py-12 px-6 bg-slate-950">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Bot className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-300 text-sm">iaPedido</span>
          </div>

          <p className="text-center sm:text-left">
            © {new Date().getFullYear()} iaPedido • Automação Inteligente de Pedidos e Vendas para WhatsApp. Todos os direitos reservados.
          </p>

          <div className="flex items-center gap-4">
            <button onClick={() => onGoToAuth('login')} className="hover:text-slate-300 cursor-pointer">Login</button>
            <button onClick={() => onGoToAuth('register')} className="hover:text-slate-300 cursor-pointer">Criar Conta</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
