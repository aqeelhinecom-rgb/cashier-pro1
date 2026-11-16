import React, { useState, useEffect } from 'react';
import {
  Search,
  Boxes,
  ShoppingCart,
  Users,
  Truck,
  FileSpreadsheet,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Product, ScreenId } from '../types';
import { DB } from '../services/db';

interface HomeScreenProps {
  onNavigate: (screen: ScreenId) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  const [search, setSearch] = useState('');
  const [quickResults, setQuickResults] = useState<Product[]>([]);
  const [stats, setStats] = useState({
    todaySales: 0,
    salesCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalProducts: 0,
    totalCustomerDebt: 0,
  });

  const settings = DB.getSettings();

  useEffect(() => {
    const updateStats = () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const report = DB.getReport(startOfDay, endOfDay);
      const products = DB.getProducts();
      const lowStock = products.filter((p) => p.qty <= 5);
      const outStock = products.filter((p) => p.qty <= 0);
      const customers = DB.getParties('customer');
      const customerDebt = customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0);

      setStats({
        todaySales: report.sales,
        salesCount: report.salesInvoicesCount ?? 0,
        lowStockCount: lowStock.length,
        outOfStockCount: outStock.length,
        totalProducts: products.length,
        totalCustomerDebt: customerDebt,
      });
    };

    updateStats();
    return DB.subscribe(updateStats);
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setQuickResults([]);
      return;
    }
    setQuickResults(DB.getProducts(q).slice(0, 6));
  }, [search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      onNavigate('products');
    }
  };

  // Ordered from Right to Left in RTL grid
  const cards = [
    {
      id: 'products' as ScreenId,
      title: 'مخزن المنتجات',
      subtitle: `${stats.totalProducts} صنف مسجل`,
      image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=700&q=80',
      icon: Boxes,
      isFullWidth: true,
    },
    {
      id: 'purchase' as ScreenId,
      title: 'المشتريات',
      subtitle: 'توريد بضاعة للمخزن',
      image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=700&q=80',
      icon: ShoppingCart,
    },
    {
      id: 'sale' as ScreenId,
      title: 'المبيعات',
      subtitle: 'فاتورة بيع سريعة',
      image: 'https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=700&q=80',
      icon: TrendingUp,
    },
    {
      id: 'customers' as ScreenId,
      title: 'العملاء',
      subtitle: 'دفتر الديون والتحصيل',
      image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=700&q=80',
      icon: Users,
    },
    {
      id: 'suppliers' as ScreenId,
      title: 'الموردين',
      subtitle: 'حسابات ومستحقات الموردين',
      image: 'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?auto=format&fit=crop&w=700&q=80',
      icon: Truck,
    },
    {
      id: 'expenses' as ScreenId,
      title: 'المصروفات',
      subtitle: 'تسجيل مصاريف المحل',
      image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=700&q=80',
      icon: CreditCard,
    },
    {
      id: 'accounts' as ScreenId,
      title: 'ادارة الحسابات',
      subtitle: 'التقارير والأرباح والجرد',
      image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=700&q=80',
      icon: FileSpreadsheet,
    },
  ];

  return (
    <div dir="rtl" className="space-y-2.5 sm:space-y-3.5 text-right">
      {/* Top Instant Price & Stock Lookup Bar */}
      <div className="relative">
        <form onSubmit={handleSearchSubmit} className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن منتج أو باركود لمعرفة السعر..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 pr-9 pl-8 text-xs sm:text-sm font-semibold text-slate-800 text-right focus:border-[#1e4663] focus:outline-hidden shadow-2xs transition"
          />
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1e4663]" />
          {search.trim() !== '' && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {/* Live Price & Stock Checker Results */}
        {search.trim() !== '' && (
          <div className="absolute inset-x-0 top-full mt-1.5 z-30 rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-[#1e4663] text-white px-3 py-1.5 text-[11px] font-bold flex items-center justify-between">
              <span>كاشف السعر والرصيد السريع</span>
              <span>النتائج: {quickResults.length}</span>
            </div>
            {quickResults.length === 0 ? (
              <div className="p-3.5 text-center text-xs font-bold text-slate-400">
                لا يوجد منتج مطابق لـ &quot;{search}&quot;
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {quickResults.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition"
                  >
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900 text-xs sm:text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className="truncate">{p.category || 'عام'}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-bold shrink-0 ${
                            p.qty <= 0
                              ? 'text-[#b91c1c]'
                              : p.qty <= 5
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          الرصيد: {p.qty}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-left">
                        <span className="text-[10px] text-slate-400 block">سعر البيع</span>
                        <span className="font-black font-mono text-sm text-[#1e4663]">
                          {p.sell_price.toFixed(0)} {settings.currency}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('sale')}
                        className="rounded-xl bg-[#0d9488] hover:bg-teal-700 text-white px-2.5 py-1.5 text-xs font-bold transition cursor-pointer"
                      >
                        بيع
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Business KPI Summary Row (4 compact cards suited for phone screens) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-right">
        <div
          onClick={() => onNavigate('invoices_sale')}
          className="cursor-pointer bg-white rounded-xl p-2.5 border border-slate-200/90 shadow-2xs hover:border-[#1e4663] transition"
        >
          <span className="text-slate-500 font-semibold block text-[10px] sm:text-[11px] truncate">
            مبيعات اليوم ({stats.salesCount})
          </span>
          <span className="font-black font-mono text-[#1e4663] text-xs sm:text-sm mt-0.5 block truncate">
            {stats.todaySales.toFixed(0)} {settings.currency}
          </span>
        </div>

        <div
          onClick={() => onNavigate('customers')}
          className="cursor-pointer bg-white rounded-xl p-2.5 border border-slate-200/90 shadow-2xs hover:border-[#b91c1c] transition"
        >
          <span className="text-slate-500 font-semibold block text-[10px] sm:text-[11px] truncate">
            ديون لنا عند العملاء
          </span>
          <span
            className={`font-black font-mono text-xs sm:text-sm mt-0.5 block truncate ${
              stats.totalCustomerDebt > 0 ? 'text-[#b91c1c]' : 'text-emerald-700'
            }`}
          >
            {stats.totalCustomerDebt.toFixed(0)} {settings.currency}
          </span>
        </div>

        <div
          onClick={() => onNavigate('products')}
          className="cursor-pointer bg-white rounded-xl p-2.5 border border-slate-200/90 shadow-2xs hover:border-[#0d9488] transition"
        >
          <span className="text-slate-500 font-semibold block text-[10px] sm:text-[11px] truncate">
            أصناف المخزن
          </span>
          <span className="font-black font-mono text-slate-900 text-xs sm:text-sm mt-0.5 block truncate">
            {stats.totalProducts} صنف
          </span>
        </div>

        <div
          onClick={() => onNavigate('accounts')}
          className="cursor-pointer bg-white rounded-xl p-2.5 border border-slate-200/90 shadow-2xs hover:border-amber-600 transition"
        >
          <span className="text-slate-500 font-semibold block text-[10px] sm:text-[11px] truncate">
            النواقص والمنتهي
          </span>
          <span
            className={`font-black font-mono text-xs sm:text-sm mt-0.5 flex items-center gap-1 truncate ${
              stats.lowStockCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {stats.lowStockCount > 0 && <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />}
            <span>{stats.lowStockCount} صنف</span>
          </span>
        </div>
      </div>

      {/* Main Grid ordered Right-to-Left */}
      <div className="grid grid-cols-2 gap-2.5" dir="rtl">
        {cards.map((card) => {
          return (
            <div
              key={card.id}
              onClick={() => onNavigate(card.id)}
              className={`group relative overflow-hidden rounded-2xl bg-[#0f2435] cursor-pointer shadow-xs hover:shadow-md transition-all active:scale-98 border border-slate-200/80 ${
                card.isFullWidth ? 'col-span-2 h-28 sm:h-36' : 'h-24 sm:h-32'
              }`}
            >
              {/* Background Image with harmonized navy overlay & clean offline fallback */}
              <img
                src={card.image}
                alt={card.title}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f2435]/85 via-[#1e4663]/20 to-transparent" />

              {/* Title Label on bottom right */}
              <div className="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 rounded-xl bg-[#1e4663]/95 backdrop-blur-xs px-2.5 py-1 sm:px-3 sm:py-1.5 text-white shadow-md border border-white/15 transition-transform group-hover:scale-105">
                <span className="text-xs sm:text-sm font-extrabold tracking-wide block leading-snug">
                  {card.title}
                </span>
                <span className="text-[9px] sm:text-[10px] text-slate-200 font-medium block leading-tight">
                  {card.subtitle}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
