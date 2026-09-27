import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Bike, 
  ShoppingBag, 
  Printer, 
  Clock, 
  Phone, 
  MapPin, 
  DollarSign, 
  AlertCircle,
  ChefHat,
  Check,
  Send,
  Filter
} from 'lucide-react';
import { Order, OrderStatus } from '../types';

interface OrdersViewProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus, reason?: string) => Promise<void>;
  loading: boolean;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  onUpdateStatus,
  loading
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('PENDENTE');
  const [rejectModalOrder, setRejectModalOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const filterTabs = [
    { id: 'PENDENTE', label: 'Novos / Pendentes', color: 'emerald' },
    { id: 'EM_PREPARO', label: 'Em Preparo', color: 'amber' },
    { id: 'A_CAMINHO', label: 'Saiu p/ Entrega', color: 'blue' },
    { id: 'PRONTO', label: 'Pronto p/ Retirada', color: 'purple' },
    { id: 'CONCLUIDO', label: 'Concluídos', color: 'slate' },
    { id: 'CANCELADO', label: 'Cancelados', color: 'rose' },
    { id: 'ALL', label: 'Todos os Pedidos', color: 'slate' },
  ];

  const filteredOrders = orders.filter(order => {
    if (activeFilter === 'ALL') return true;
    return order.status === activeFilter;
  });

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDENTE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">Aguardando Confirmação</span>;
      case 'CONFIRMADO':
      case 'EM_PREPARO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">Em Preparo na Cozinha</span>;
      case 'A_CAMINHO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">🛵 Saiu para Entrega</span>;
      case 'PRONTO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">🛍️ Pronto p/ Retirada</span>;
      case 'CONCLUIDO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">Entregue & Concluído</span>;
      case 'CANCELADO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">Cancelado</span>;
      default:
        return null;
    }
  };

  const handleStatusChange = async (orderId: string, status: OrderStatus, reason?: string) => {
    try {
      setIsUpdating(orderId);
      await onUpdateStatus(orderId, status, reason);
    } finally {
      setIsUpdating(null);
      setRejectModalOrder(null);
      setRejectReason('');
    }
  };

  const handlePrintOrder = (order: Order) => {
    const printWindow = window.open('', '', 'width=380,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Comanda #${order.orderNumber || order.id.slice(-4)}</title>
          <style>
            body { font-family: monospace; font-size: 13px; padding: 10px; line-height: 1.4; }
            .center { text-align: center; }
            .line { border-bottom: 1px dashed #000; margin: 8px 0; }
            .item { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="center bold">=== ZAPPEDIDOS IA ===</div>
          <div class="center bold" style="font-size: 16px;">PEDIDO #${order.orderNumber || order.id.slice(-4)}</div>
          <div class="center">${new Date(order.createdAt).toLocaleString('pt-BR')}</div>
          <div class="line"></div>
          <div><span class="bold">Cliente:</span> ${order.customerName}</div>
          <div><span class="bold">Telefone:</span> ${order.customerPhone}</div>
          <div><span class="bold">Tipo:</span> ${order.deliveryType}</div>
          ${order.deliveryType === 'DELIVERY' ? `<div><span class="bold">Endereço:</span> ${order.customerAddress || 'Não informado'}</div>` : ''}
          <div class="line"></div>
          <div class="bold">ITENS:</div>
          ${order.items.map(it => `
            <div class="item">
              <span>${it.quantity}x ${it.name} ${it.notes ? `(${it.notes})` : ''}</span>
              <span>R$ ${it.total.toFixed(2)}</span>
            </div>
          `).join('')}
          <div class="line"></div>
          <div class="item"><span>Subtotal:</span><span>R$ ${order.subtotal.toFixed(2)}</span></div>
          <div class="item"><span>Taxa Entrega:</span><span>R$ ${order.deliveryFee.toFixed(2)}</span></div>
          <div class="item bold" style="font-size: 15px;"><span>TOTAL:</span><span>R$ ${order.total.toFixed(2)}</span></div>
          <div class="line"></div>
          <div><span class="bold">Pagamento:</span> ${order.paymentMethod}</div>
          ${order.changeFor ? `<div><span class="bold">Troco para:</span> R$ ${order.changeFor.toFixed(2)}</div>` : ''}
          ${order.notes ? `<div><span class="bold">Obs:</span> ${order.notes}</div>` : ''}
          <div class="line"></div>
          <div class="center">Impresso pelo Painel</div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            Gestão de Pedidos em Tempo Real
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Pedidos recebidos via WhatsApp pela Inteligência Artificial. Ao confirmar ou alterar status, a IA avisa o cliente automaticamente!
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/80">
        {filterTabs.map(tab => {
          const count = orders.filter(o => tab.id === 'ALL' ? true : o.status === tab.id).length;
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-emerald-400" />
          <p>Carregando pedidos em tempo real...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-12 text-center text-slate-400">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-200">Nenhum pedido encontrado nesta aba</h3>
          <p className="text-sm mt-1 max-w-md mx-auto text-slate-400">
            Quando um cliente finalizar um pedido pelo WhatsApp com a IA, ele aparecerá instantaneamente aqui!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOrders.map(order => {
            const isUpdatingCurrent = isUpdating === order.id;
            return (
              <div
                key={order.id}
                className="bg-slate-900/90 rounded-2xl border border-slate-800/90 hover:border-slate-700/80 transition shadow-xl overflow-hidden flex flex-col justify-between"
              >
                {/* Order Top Bar */}
                <div className="p-5 border-b border-slate-800/80 bg-slate-950/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-extrabold text-lg text-white font-mono flex items-center gap-1.5">
                      #{order.orderNumber || order.id.slice(-4)}
                    </span>
                    {getStatusBadge(order.status)}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-1.5 font-medium text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      {order.deliveryType === 'DELIVERY' ? (
                        <>
                          <Bike className="w-3.5 h-3.5" /> Delivery
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="w-3.5 h-3.5" /> Retirada
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Customer & Address Details */}
                <div className="p-5 space-y-3 flex-1">
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">{order.customerName}</h4>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      {order.customerPhone}
                    </p>
                  </div>

                  {order.deliveryType === 'DELIVERY' && (
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs">
                      <div className="flex items-start gap-2 text-slate-300">
                        <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-white">Endereço de Entrega:</p>
                          <p className="text-slate-400 mt-0.5">{order.customerAddress || 'A combinar'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Items List */}
                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Itens do Pedido</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between text-xs py-1 border-b border-slate-800/40">
                          <div>
                            <span className="font-bold text-emerald-400 mr-1.5">{item.quantity}x</span>
                            <span className="text-slate-200">{item.name}</span>
                            {item.notes && (
                              <p className="text-[11px] text-amber-400 italic">Obs: {item.notes}</p>
                            )}
                          </div>
                          <span className="font-mono text-slate-300 font-semibold ml-2">
                            R$ {item.total.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment & Totals */}
                  <div className="pt-2 space-y-1 border-t border-slate-800/60 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Subtotal</span>
                      <span className="font-mono">R$ {order.subtotal.toFixed(2)}</span>
                    </div>
                    {order.deliveryFee > 0 && (
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Taxa de Entrega</span>
                        <span className="font-mono">R$ {order.deliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-white font-extrabold text-sm pt-1 border-t border-slate-800/80">
                      <span>Total</span>
                      <span className="font-mono text-emerald-400">R$ {order.total.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                        {order.paymentMethod}
                      </span>
                      {order.changeFor && (
                        <span className="text-amber-400 font-medium">Troco p/ R$ {order.changeFor.toFixed(2)}</span>
                      )}
                    </div>
                  </div>

                  {order.rejectionReason && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                      <strong>Motivo do cancelamento:</strong> {order.rejectionReason}
                    </div>
                  )}
                </div>

                {/* Action Buttons Footer */}
                <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 flex flex-col gap-2">
                  {/* Print button */}
                  <button
                    onClick={() => handlePrintOrder(order)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir Comanda</span>
                  </button>

                  {/* Flow Actions */}
                  {order.status === 'PENDENTE' && (
                    <div className="flex gap-2">
                      <button
                        disabled={isUpdatingCurrent}
                        onClick={() => handleStatusChange(order.id, 'EM_PREPARO')}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-500/20"
                      >
                        <ChefHat className="w-4 h-4" />
                        <span>Confirmar Pedido</span>
                      </button>
                      <button
                        disabled={isUpdatingCurrent}
                        onClick={() => setRejectModalOrder(order)}
                        className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {order.status === 'EM_PREPARO' && (
                    <div className="flex gap-2">
                      {order.deliveryType === 'DELIVERY' ? (
                        <button
                          disabled={isUpdatingCurrent}
                          onClick={() => handleStatusChange(order.id, 'A_CAMINHO')}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Bike className="w-4 h-4" />
                          <span>Despachar Entrega</span>
                        </button>
                      ) : (
                        <button
                          disabled={isUpdatingCurrent}
                          onClick={() => handleStatusChange(order.id, 'PRONTO')}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span>Pronto p/ Retirada</span>
                        </button>
                      )}
                    </div>
                  )}

                  {(order.status === 'A_CAMINHO' || order.status === 'PRONTO') && (
                    <button
                      disabled={isUpdatingCurrent}
                      onClick={() => handleStatusChange(order.id, 'CONCLUIDO')}
                      className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Concluir & Finalizar</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOrder && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-white">Recusar Pedido #{rejectModalOrder.orderNumber || rejectModalOrder.id.slice(-4)}</h3>
            </div>
            <p className="text-xs text-slate-400">
              Ao recusar, a IA enviará automaticamente uma mensagem no WhatsApp do cliente informando o cancelamento e o motivo abaixo:
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Motivo do Cancelamento:
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Ex: Ingredientes esgotados, endereço fora da área de entrega, ou cozinha encerrando."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500/60"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectModalOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                onClick={() => handleStatusChange(rejectModalOrder.id, 'CANCELADO', rejectReason || 'Sem estoque disponível')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer shadow-lg shadow-rose-600/30"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
