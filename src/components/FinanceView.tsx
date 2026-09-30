import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Calendar, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download, 
  PieChart as PieChartIcon, 
  Award, 
  CheckCircle2, 
  Clock, 
  Truck,
  Sparkles,
  ChevronDown,
  Filter,
  BarChart3
} from 'lucide-react';
import { Order, OrderStatus, Establishment } from '../types';
import { getSegmentConfig, getSegmentCatalogIcon } from '../utils/segments';

interface FinanceViewProps {
  orders: Order[];
  establishment?: Establishment | null;
}

type PeriodFilter = 'TODAY' | 'WEEK' | 'MONTH' | 'LAST_MONTH' | 'ALL';

export const FinanceView: React.FC<FinanceViewProps> = ({ orders, establishment }) => {
  const segConfig = getSegmentConfig(establishment?.segment);
  const CatalogIcon = getSegmentCatalogIcon(establishment?.segment);
  const [period, setPeriod] = useState<PeriodFilter>('MONTH');

  // Filter orders by period and validity
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return orders.filter(o => {
      // Ignore cancelled orders for revenue calculation
      if (o.status === 'CANCELADO') return false;

      const orderDate = new Date(o.createdAt);
      if (isNaN(orderDate.getTime())) return true;

      switch (period) {
        case 'TODAY':
          return orderDate >= startOfToday;
        case 'WEEK': {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          return orderDate >= sevenDaysAgo;
        }
        case 'MONTH': {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return orderDate >= startOfMonth;
        }
        case 'LAST_MONTH': {
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          return orderDate >= startOfLastMonth && orderDate <= endOfLastMonth;
        }
        case 'ALL':
        default:
          return true;
      }
    });
  }, [orders, period]);

  // Financial Metrics Calculations
  const stats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalSubtotal = filteredOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
    const totalDeliveryFees = filteredOrders.reduce((sum, o) => sum + (Number(o.deliveryFee) || 0), 0);
    const totalOrdersCount = filteredOrders.length;
    const averageTicket = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

    // Delivery vs Retirada
    const deliveryCount = filteredOrders.filter(o => o.deliveryType === 'DELIVERY').length;
    const pickupCount = filteredOrders.filter(o => o.deliveryType === 'RETIRADA').length;

    // Payment Methods Breakdown
    const paymentMap: Record<string, { count: number; total: number }> = {
      PIX: { count: 0, total: 0 },
      'Cartão de Crédito': { count: 0, total: 0 },
      'Cartão de Débito': { count: 0, total: 0 },
      Dinheiro: { count: 0, total: 0 },
      Outros: { count: 0, total: 0 }
    };

    filteredOrders.forEach(o => {
      const pm = (o.paymentMethod || '').toLowerCase();
      const val = Number(o.total) || 0;

      if (pm.includes('pix')) {
        paymentMap.PIX.count++;
        paymentMap.PIX.total += val;
      } else if (pm.includes('crédito') || pm.includes('credito')) {
        paymentMap['Cartão de Crédito'].count++;
        paymentMap['Cartão de Crédito'].total += val;
      } else if (pm.includes('débito') || pm.includes('debito')) {
        paymentMap['Cartão de Débito'].count++;
        paymentMap['Cartão de Débito'].total += val;
      } else if (pm.includes('dinheiro')) {
        paymentMap.Dinheiro.count++;
        paymentMap.Dinheiro.total += val;
      } else {
        paymentMap.Outros.count++;
        paymentMap.Outros.total += val;
      }
    });

    // Top Products
    const productsMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    filteredOrders.forEach(o => {
      (o.items || []).forEach(it => {
        const prodName = it.name || 'Item do Cardápio';
        const qty = Number(it.quantity) || 1;
        const rev = Number(it.total) || (Number(it.unitPrice || 0) * qty);

        const existing = productsMap.get(prodName);
        if (existing) {
          existing.quantity += qty;
          existing.revenue += rev;
        } else {
          productsMap.set(prodName, { name: prodName, quantity: qty, revenue: rev });
        }
      });
    });

    const topProducts = Array.from(productsMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Monthly Projection
    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - currentDay);
    const dailyAverage = currentDay > 0 ? (totalRevenue / currentDay) : totalRevenue;
    const projectedMonthTotal = totalRevenue + (dailyAverage * daysRemaining);

    return {
      totalRevenue,
      totalSubtotal,
      totalDeliveryFees,
      totalOrdersCount,
      averageTicket,
      deliveryCount,
      pickupCount,
      paymentMap,
      topProducts,
      dailyAverage,
      projectedMonthTotal
    };
  }, [filteredOrders]);

  // Chart data: daily grouping
  const dailyChartData = useMemo(() => {
    const daysMap = new Map<string, { label: string; revenue: number; ordersCount: number }>();

    // Generate last 7 days keys if period is week or today
    const countDays = period === 'WEEK' ? 7 : period === 'MONTH' ? 14 : 7;
    for (let i = countDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      daysMap.set(key, { label: key, revenue: 0, ordersCount: 0 });
    }

    filteredOrders.forEach(o => {
      const d = new Date(o.createdAt);
      if (!isNaN(d.getTime())) {
        const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const existing = daysMap.get(key);
        if (existing) {
          existing.revenue += Number(o.total) || 0;
          existing.ordersCount += 1;
        } else {
          daysMap.set(key, { label: key, revenue: Number(o.total) || 0, ordersCount: 1 });
        }
      }
    });

    const entries = Array.from(daysMap.values());
    const maxRev = Math.max(...entries.map(e => e.revenue), 10);
    return { entries, maxRev };
  }, [filteredOrders, period]);

  // Export orders to CSV
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      alert('Nenhum pedido no período selecionado para exportar.');
      return;
    }

    const headers = ['Pedido', 'Data/Hora', 'Cliente', 'Telefone', 'Tipo', 'Forma Pagamento', 'Subtotal', 'Taxa Entrega', 'Total', 'Status'];
    const rows = filteredOrders.map(o => [
      `#${o.orderNumber || o.id.slice(0, 6)}`,
      new Date(o.createdAt).toLocaleString('pt-BR'),
      `"${o.customerName || 'Cliente'}"`,
      `"${o.customerPhone || ''}"`,
      o.deliveryType,
      `"${o.paymentMethod}"`,
      `R$ ${(Number(o.subtotal) || 0).toFixed(2)}`,
      `R$ ${(Number(o.deliveryFee) || 0).toFixed(2)}`,
      `R$ ${(Number(o.total) || 0).toFixed(2)}`,
      o.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_financeiro_${period.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-8 animate-in fade-in">
      {/* Top Banner & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Painel Financeiro & Receita
              <span className="text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Tempo Real
              </span>
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Visão consolidada de faturamento, ticket médio, métodos de pagamento e métricas de receita de {segConfig.catalogTitle.toLowerCase()}.
          </p>
        </div>

        {/* Action Buttons & Period Pills */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
          {/* Period Selector Pills */}
          <div className="bg-slate-900 border border-slate-800 p-1 rounded-2xl flex items-center gap-1 text-xs shrink-0">
            <button
              onClick={() => setPeriod('TODAY')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
                period === 'TODAY'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('WEEK')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
                period === 'WEEK'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setPeriod('MONTH')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
                period === 'MONTH'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Este Mês
            </button>
            <button
              onClick={() => setPeriod('LAST_MONTH')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
                period === 'LAST_MONTH'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mês Passado
            </button>
            <button
              onClick={() => setPeriod('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
                period === 'ALL'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tudo
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            title="Exportar planilha CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Cards Grid (4 columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-4 sm:p-6 relative overflow-hidden backdrop-blur-md shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Faturamento Total</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white tracking-tight">
              R$ {stats.totalRevenue.toFixed(2)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold mt-1">
              <ArrowUpRight className="w-4 h-4" />
              <span>{stats.totalOrdersCount} pedidos confirmados</span>
            </div>
          </div>
        </div>

        {/* Monthly Projection */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 relative overflow-hidden backdrop-blur-md shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Projeção do Mês</span>
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-sm">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-purple-300 tracking-tight">
              R$ {stats.projectedMonthTotal.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Média diária atual: <strong className="text-slate-200">R$ {stats.dailyAverage.toFixed(2)}</strong>
            </p>
          </div>
        </div>

        {/* Average Ticket */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 relative overflow-hidden backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ticket Médio</span>
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-sm">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              R$ {stats.averageTicket.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Valor médio gasto por cliente
            </p>
          </div>
        </div>

        {/* Delivery Fees Collected */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 relative overflow-hidden backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taxas de Entrega</span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-sm">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              R$ {stats.totalDeliveryFees.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {stats.deliveryCount} entregas • {stats.pickupCount} retiradas
            </p>
          </div>
        </div>
      </div>

      {/* Middle Section: Chart & Payment Methods Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Daily Evolution Chart */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 lg:p-7 space-y-6 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                Evolução Diária de Vendas
              </h3>
              <p className="text-xs text-slate-400">
                Faturamento diário registrado no período selecionado
              </p>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-6 pb-2 overflow-x-auto scrollbar-none">
            <div className="h-56 min-w-[320px] flex items-end gap-2 sm:gap-3 border-b border-slate-800 pb-2">
              {dailyChartData.entries.map((item, idx) => {
                const heightPercent = Math.max(8, Math.round((item.revenue / dailyChartData.maxRev) * 100));
                const isMax = item.revenue > 0 && item.revenue === dailyChartData.maxRev;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                    {/* Tooltip on Hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none absolute -top-12 z-20 bg-slate-950 border border-slate-800 text-[11px] rounded-xl px-2.5 py-1.5 shadow-2xl whitespace-nowrap text-center">
                      <p className="font-bold text-emerald-400">R$ {item.revenue.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-400">{item.ordersCount} pedido(s)</p>
                    </div>

                    {/* Bar */}
                    <div 
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-xl transition-all duration-500 cursor-pointer ${
                        item.revenue > 0
                          ? isMax 
                            ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-lg shadow-emerald-500/20' 
                            : 'bg-emerald-500/70 hover:bg-emerald-400'
                          : 'bg-slate-800/40 hover:bg-slate-800'
                      }`}
                    />

                    {/* Label */}
                    <span className="text-[10px] font-mono text-slate-400 tracking-tighter truncate max-w-full">
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Payment Methods Breakdown */}
        <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 lg:p-7 space-y-6 backdrop-blur-md">
          <div className="space-y-1">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-400" />
              Formas de Pagamento
            </h3>
            <p className="text-xs text-slate-400">
              Distribuição por canal de recebimento
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {Object.entries(stats.paymentMap).map(([method, data]) => {
              const percent = stats.totalRevenue > 0 ? (data.total / stats.totalRevenue) * 100 : 0;
              if (data.total === 0 && stats.totalRevenue > 0) return null;

              return (
                <div key={method} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">{method}</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      R$ {data.total.toFixed(2)} ({percent.toFixed(0)}%)
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                    <div 
                      style={{ width: `${percent}%` }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{data.count} pedido(s)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Section: Top Products & Recent Financial Orders Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top 5 Products (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 lg:p-7 space-y-5 backdrop-blur-md">
          <div className="space-y-1">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <CatalogIcon className="w-4 h-4 text-emerald-400" />
              {segConfig.itemPluralNoun} Mais Faturados
            </h3>
            <p className="text-xs text-slate-400">
              Os campeões de receita do seu {segConfig.catalogTitle.toLowerCase()}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {stats.topProducts.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhum produto vendido no período.</p>
            ) : (
              stats.topProducts.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-black flex items-center justify-center border border-emerald-500/20">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white leading-tight">{p.name}</p>
                      <p className="text-[10px] text-slate-400">{p.quantity} unidade(s) vendida(s)</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-emerald-400 font-mono">
                      R$ {p.revenue.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Financial Orders Table (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-4 sm:p-6 lg:p-7 space-y-5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Extrato de Pedidos Confirmados
              </h3>
              <p className="text-xs text-slate-400">
                Últimos pedidos que geraram faturamento
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {filteredOrders.length} pedido(s)
            </span>
          </div>

          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-3">Pedido</th>
                  <th className="pb-3">Cliente</th>
                  <th className="pb-3">Pagamento</th>
                  <th className="pb-3">Data</th>
                  <th className="pb-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredOrders.slice(0, 7).map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 font-mono font-bold text-white">
                      #{o.orderNumber || o.id.slice(0, 5)}
                    </td>
                    <td className="py-3 font-medium text-slate-200">
                      {o.customerName || 'Cliente'}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-300">
                        {o.paymentMethod || 'A combinar'}
                      </span>
                    </td>
                    <td className="py-3 text-[11px] text-slate-400">
                      {new Date(o.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 text-right font-mono font-bold text-emerald-400">
                      R$ {(Number(o.total) || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Nenhum pedido faturado neste período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
