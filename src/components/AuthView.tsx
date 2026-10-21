import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signInWithCustomToken
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { 
  Bot, 
  Lock, 
  Mail, 
  Store, 
  Phone, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  ArrowLeft
} from 'lucide-react';
import { SEGMENT_OPTIONS, getSegmentConfig } from '../utils/segments';
import { getRecommendedPlanForSegment } from '../utils/subscription';

interface AuthViewProps {
  onAuthSuccess: (storeId: string, email?: string) => void;
  initialMode?: 'login' | 'register';
  onBackToHome?: () => void;
  referralCode?: string;
}

export const AuthView: React.FC<AuthViewProps> = ({ 
  onAuthSuccess, 
  initialMode = 'login',
  onBackToHome,
  referralCode
}) => {
  const [isRegister, setIsRegister] = useState(initialMode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration specific fields
  const [storeName, setStoreName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [segment, setSegment] = useState('FOOD');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const initializeStoreProfile = async (uid: string, name: string, phone: string, storeSegment: string, storeEmail?: string) => {
    try {
      const estRef = doc(db, 'establishments', uid);
      const snap = await getDoc(estRef);
      
      const segConf = getSegmentConfig(storeSegment);
      const recommendedPlan = getRecommendedPlanForSegment(segConf.id);
      const cleanInstName = `pedidos_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15)}_${uid.slice(0, 5)}`;
      const ownReferralCode = `IA-${uid.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;
      const storeData = {
        id: uid,
        name: name || 'Meu Negócio',
        segment: segConf.id,
        phone: phone || '',
        address: 'Rua Principal, 100 - Centro',
        deliveryFee: segConf.hasDeliveryFee === false ? 0 : 7.00,
        estimatedDeliveryTime: segConf.id === 'AUTOMOTIVE_PARTS' ? 'Sob análise técnica' : segConf.id === 'VEHICLES' ? 'Visitas agendadas' : '35 a 50 minutos',
        operatingHours: 'Segunda a Sábado das 08:00 às 18:00',
        description: segConf.categoryDesc,
        pixKey: storeEmail || email || '',
        evolutionApiUrl: 'http://86.48.23.152:8081',
        evolutionApiKey: 'minha_chave_secreta_7108',
        evolutionInstanceName: cleanInstName,
        evolutionConnected: false,
        aiPromptCustom: segConf.defaultPrompt.replace(/\{loja\}/g, name || 'Nossa Empresa'),
        aiWelcomeMessage: segConf.defaultWelcome.replace(/\{loja\}/g, name || 'Nossa Empresa'),
        ...(referralCode ? { referredBy: referralCode.toUpperCase() } : {}),
        referralCode: ownReferralCode,
        createdAt: new Date().toISOString(),
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        plan: 'trial',
        planTier: recommendedPlan.id,
        accountStatus: 'trial',
        planPrice: recommendedPlan.price
      };

      if (!snap.exists()) {
        try {
          await setDoc(estRef, storeData);
        } catch (clientErr) {
          console.warn('Erro ao salvar no client Firestore, usando API backend:', clientErr);
          await fetch('/api/establishment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storeData)
          });
        }

        // Food examples belong only to food accounts. Other niches start empty.
        if (segConf.id === 'FOOD') try {
          const p1Ref = doc(db, 'establishments', uid, 'products', 'prod_1');
          await setDoc(p1Ref, {
            id: 'prod_1',
            name: 'Item Especial da Casa',
            description: 'Receita artesanal exclusiva com acompanhamentos frescos.',
            price: 34.90,
            category: 'Principais',
            imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
            available: true,
            createdAt: new Date().toISOString()
          });

          const p2Ref = doc(db, 'establishments', uid, 'products', 'prod_2');
          await setDoc(p2Ref, {
            id: 'prod_2',
            name: 'Refrigerante Lata 350ml',
            description: 'Bebida bem gelada para acompanhar.',
            price: 6.50,
            category: 'Bebidas',
            imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
            available: true,
            createdAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn('Produtos de exemplo não puderam ser gravados no client:', e);
        }
      }
    } catch (err: any) {
      console.warn('Erro ao inicializar perfil:', err.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!storeName.trim()) {
          throw new Error('Informe o nome do seu estabelecimento.');
        }

        try {
          const userCred = await createUserWithEmailAndPassword(auth, email, password);
          await initializeStoreProfile(userCred.user.uid, storeName, storePhone, segment);
          onAuthSuccess(userCred.user.uid, email);
          return;
        } catch (clientErr: any) {
          console.warn('[AuthView] Client auth falhou, acionando fallback seguro no backend:', clientErr.code || clientErr.message);

          const fbRes = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, storeName, storePhone, segment, referralCode })
          });
          const fbData = await fbRes.json();
          if (!fbRes.ok || !fbData.success) {
            throw new Error(fbData.error || 'Falha ao cadastrar estabelecimento.');
          }
          if (fbData.customToken) {
            try {
              await signInWithCustomToken(auth, fbData.customToken);
            } catch {}
          }
          onAuthSuccess(fbData.uid, fbData.email);
          return;
        }
      } else {
        try {
          const userCred = await signInWithEmailAndPassword(auth, email, password);
          onAuthSuccess(userCred.user.uid, email);
          return;
        } catch (clientErr: any) {
          console.warn('[AuthView] Client sign-in falhou, acionando fallback seguro no backend:', clientErr.code || clientErr.message);

          const fbRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const fbData = await fbRes.json();
          if (!fbRes.ok || !fbData.success) {
            throw new Error(fbData.error || 'E-mail ou senha incorretos.');
          }
          if (fbData.customToken) {
            try {
              await signInWithCustomToken(auth, fbData.customToken);
            } catch {}
          }
          onAuthSuccess(fbData.uid, fbData.email);
          return;
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      let msg = err.message || 'Falha na autenticação.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'E-mail ou senha incorretos.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'Este e-mail já está cadastrado. Faça login na aba Entrar.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'A senha deve ter no mínimo 6 caracteres.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const defaultName = user.displayName ? `${user.displayName}'s Gastronomia` : 'Meu Estabelecimento';
      await initializeStoreProfile(user.uid, defaultName, '', 'Alimentação & Bebidas', user.email || '');
      onAuthSuccess(user.uid, user.email || undefined);
    } catch (err: any) {
      console.error('Google auth error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Falha ao autenticar com Google: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMsg('Digite seu e-mail no campo acima para recuperar a senha.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
      setErrorMsg('');
    } catch (err: any) {
      setErrorMsg('Erro ao enviar e-mail de recuperação: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Decorative Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        
        {/* Back to Home Button */}
        {onBackToHome && (
          <button
            type="button"
            onClick={onBackToHome}
            className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-emerald-400 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para a Página Inicial</span>
          </button>
        )}

        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 mb-4">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Bot className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            ia<span className="text-emerald-400">Pedido</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Plataforma de Atendimento e Vendas no WhatsApp para qualquer segmento
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-black/50">
          
          {/* Tab Selector */}
          <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => { setIsRegister(false); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                !isRegister 
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setIsRegister(true); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                isRegister 
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Novo Estabelecimento
            </button>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-rose-400 text-xs leading-relaxed animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-emerald-400 text-xs leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Nome do Estabelecimento *
                  </label>
                  <div className="relative">
                    <Store className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Pizzaria Bella Itália, Burger & Cia"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Segmento
                    </label>
                    <select
                      value={segment}
                      onChange={(e) => setSegment(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    >
                      {SEGMENT_OPTIONS.map((seg) => (
                        <option key={seg.id} value={seg.id}>
                          {seg.emoji} {seg.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      WhatsApp Loja
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="5511999999999"
                        value={storePhone}
                        onChange={(e) => setStorePhone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                E-mail de Acesso
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                      placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Senha
                </label>
                {!isRegister && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Esqueceu?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegister ? 'Criar Meu Estabelecimento' : 'Entrar no Painel'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Social Divider */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <span className="relative px-3 bg-slate-900 text-xs text-slate-500 uppercase tracking-wider">
              ou continue com
            </span>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full py-2.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-200 text-sm font-medium rounded-xl flex items-center justify-center gap-3 transition-colors active:scale-[0.98]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Conta Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};
