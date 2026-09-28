import React, { useState } from 'react';
import { 
  Bike, 
  Car, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  X, 
  Navigation, 
  DollarSign, 
  ShoppingBag, 
  Clock, 
  User, 
  Plus, 
  Send, 
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { Order, Courier } from '../types';

interface DispatchModalProps {
  order: Order;
  couriers: Courier[];
  establishmentName?: string;
  onClose: () => void;
  onConfirmDispatch: (options: {
    courierPhone?: string;
    courierName?: string;
    saveCourier?: boolean;
  }) => Promise<void>;
}

export const DispatchModal: React.FC<DispatchModalProps> = ({
  order,
  couriers = [],
  establishmentName = 'iaPedido.com',
  onClose,
  onConfirmDispatch
}) => {
  const [dispatchType, setDispatchType] = useState<'registered' | 'custom' | 'none'>(
    couriers.length > 0 ? 'registered' : 'custom'
  );
  const [selectedCourierId, setSelectedCourierId] = useState<string>(
    couriers.length > 0 ? couriers[0].id : ''
  );

  // Custom courier inputs
  const [customName, setCustomName] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [saveCustomCourier, setSaveCustomCourier] = useState(true);

  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const orderNum = order.orderNumber || order.id.slice(-4);
  const deliveryAddress = order.customerAddress || 'Endereço a combinar';
  const encodedAddress = encodeURIComponent(deliveryAddress);
  const hasGps = !isNaN(Number(order.latitude)) && !isNaN(Number(order.longitude)) && Number(order.latitude) !== 0;
  const wazeUrl = hasGps 
    ? `https://waze.com/ul?ll=${order.latitude},${order.longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodedAddress}`;
  const mapsUrl = hasGps 
    ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

  const selectedCourier = couriers.find(c => c.id === selectedCourierId);

  const effectiveCourierName = dispatchType === 'registered' 
    ? selectedCourier?.name 
    : dispatchType === 'custom' 
      ? customName 
      : undefined;

  const effectiveCourierPhone = dispatchType === 'registered' 
    ? selectedCourier?.phone 
    : dispatchType === 'custom' 
      ? customPhone 
      : undefined;

  const handleConfirm = async () => {
    if (dispatchType === 'registered' && !selectedCourier) {
      alert('Selecione um motoboy da lista');
      return;
    }
    if (dispatchType === 'custom' && (!customPhone || customPhone.replace(/\D/g, '').length < 10)) {
      alert('Informe um número de WhatsApp válido para o motoboy (com DDD)');
      return;
    }

    try {
      setLoading(true);
      await onConfirmDispatch({
        courierPhone: effectiveCourierPhone,
        courierName: effectiveCourierName,
        saveCourier: dispatchType === 'custom' ? saveCustomCourier : false
      });
      onClose();
    } catch (err: any) {
      alert('Erro ao despachar entrega: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <Bike className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-white tracking-tight">
                  Despachar Pedido #{orderNum}
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Rota & GPS
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Envie os dados completos para o motoboy e avise o cliente automaticamente no WhatsApp
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* Order Summary Summary Card */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">{order.customerName}</span>
                <span className="text-slate-400 font-mono flex items-center gap-1">
                  <Phone className="w-3 h-3 text-emerald-400" />
                  {order.customerPhone}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400">Total:</span>
                <span className="font-black text-emerald-400 text-sm">
                  R$ {order.total.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {order.paymentMethod}
                  {order.changeFor ? ` (Troco R$ ${order.changeFor})` : ''}
                </span>
              </div>
            </div>

            {/* Address with Quick GPS Preview */}
            <div className="flex items-start gap-2.5 text-xs">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-300">Endereço de Entrega:</span>
                  {hasGps && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      <Navigation className="w-2.5 h-2.5 text-emerald-400" />
                      GPS WhatsApp (Exato)
                    </span>
                  )}
                </div>
                <p className="text-white font-medium mt-0.5">{deliveryAddress}</p>
              </div>

              {/* Direct GPS links buttons for test/view */}
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold flex items-center gap-1 transition"
                  title="Abrir no Waze"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Waze</span>
                </a>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 transition"
                  title="Abrir no Google Maps"
                >
                  <MapPin className="w-3 h-3" />
                  <span>Maps</span>
                </a>
              </div>
            </div>
          </div>

          {/* Section: Select Courier / Motoboy */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                Quem vai fazer a entrega?
              </label>

              {/* Type Switcher */}
              <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-[11px] font-semibold">
                {couriers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDispatchType('registered')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      dispatchType === 'registered'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Equipe Cadastrada ({couriers.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDispatchType('custom')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    dispatchType === 'custom'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Outro Motoboy
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchType('none')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    dispatchType === 'none'
                      ? 'bg-slate-800 text-slate-200 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Apenas avisar cliente
                </button>
              </div>
            </div>

            {/* Mode 1: Registered Couriers List */}
            {dispatchType === 'registered' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {couriers.map((c) => {
                  const isSelected = selectedCourierId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCourierId(c.id)}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                        }`}>
                          <Bike className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{c.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{c.phone}</p>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mode 2: Custom Courier Phone & Name */}
            {dispatchType === 'custom' && (
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Nome do Entregador
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Carlos Motoboy"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      WhatsApp do Entregador (com DDD) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 5511999998888"
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveCustomCourier}
                    onChange={(e) => setSaveCustomCourier(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                  <span>Salvar este entregador na lista do restaurante para as próximas entregas</span>
                </label>
              </div>
            )}

            {/* Mode 3: None */}
            {dispatchType === 'none' && (
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  O status do pedido mudará para <strong>Saiu para Entrega</strong> e apenas o <strong>cliente</strong> receberá a mensagem no WhatsApp.
                </span>
              </div>
            )}
          </div>

          {/* Toggle Message Preview */}
          {dispatchType !== 'none' && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>{showPreview ? 'Ocultar' : 'Ver'} modelo da mensagem enviada ao motoboy</span>
                <ExternalLink className="w-3 h-3" />
              </button>

              {showPreview && (
                <div className="mt-3 p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 text-xs font-mono text-emerald-200/90 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {`🛵 *NOVA ENTREGA DISPONÍVEL - ${establishmentName}*\n━━━━━━━━━━━━━━━━━━━━\n📦 *Pedido:* #${orderNum}\n👤 *Cliente:* ${order.customerName}\n📞 *Tel do Cliente:* ${order.customerPhone}\n\n📍 *Endereço de Entrega:*\n${deliveryAddress}\n\n🗺️ *Abrir GPS com 1 Clique:*\n🚗 *Waze:* ${wazeUrl}\n📍 *Google Maps:* ${mapsUrl}\n\n🛍️ *Itens:* ${(order.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ')}\n💰 *Valor:* R$ ${order.total.toFixed(2).replace('.', ',')} (${order.paymentMethod})\n━━━━━━━━━━━━━━━━━━━━\n_Bom trabalho e dirija com segurança! 🚀_`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{loading ? 'Despachando...' : 'Confirmar & Despachar Entrega 🚀'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
