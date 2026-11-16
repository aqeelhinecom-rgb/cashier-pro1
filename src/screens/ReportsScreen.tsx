import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Calendar,
  AlertTriangle,
  Award,
  Layers,
} from 'lucide-react';
import { DB } from '../services/db';
import { ReportData } from '../types';

type PresetPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export const ReportsScreen: React.FC = () => {
  const [period, setPeriod] = useState<PresetPeriod>('day');
  const [report, setReport] = useState<ReportData | null>(null);
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  const settings = DB.getSettings();

  const calculateDates = (p: PresetPeriod): { from: Date; to: Date } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (p) {
      case 'day':
        return { from: today, to: endOfDay };
      case 'week': {
        // Saturday is beginning of week in Arab region (similar to Flutter logic: (n.weekday + 1) % 7)
        const dayOfWeek = (now.getDay() + 1) % 7;
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        return { from: startOfWeek, to: endOfDay };
      }
      case 'month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: startOfMonth, to: endOfDay };
      }
      case 'year': {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return { from: startOfYear, to: endOfDay };
      }
      case 'custom': {
        const f = customFrom ? new Date(customFrom) : today;
        const t = customTo ? new Date(`${customTo}T23:59:59`) : endOfDay;
        return { from: f, to: t };
      }
    }
  };

  const loadReport = () => {
    const { from, to } = calculateDates(period);
    const data = DB.getReport(from, to);
    setReport(data);
  };

  useEffect(() => {
    loadReport();
    return DB.subscribe(loadReport);
  }, [period, customFrom, customTo]);

  const presets: { id: PresetPeriod; label: string }[] = [
    { id: 'day', label: 'اليوم' },
    { id: 'week', label: 'الأسبوع' },
    { id: 'month', label: 'الشهر' },
    { id: 'year', label: 'السنة' },
    { id: 'custom', label: 'فترة مخصصة' },
  ];

  const maxSoldQty = report?.topSold.reduce((max, x) => Math.max(max, x.v), 1) || 1;
  const maxProfitVal = report?.topProfit.reduce((max, x) => Math.max(max, x.v), 1) || 1;

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">التقارير المالية والأرباح</h2>
            <p className="text-xs text-slate-500">
              تحليل شامل لحركة المبيعات والمشتريات وحساب صافي الأرباح
            </p>
          </div>
        </div>

        {/* Period Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                period === p.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Picker inputs if active */}
      {period === 'custom' && (
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">من تاريخ:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">إلى تاريخ:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800"
            />
          </div>
        </div>
      )}

      {/* Main 4 Metric Cards */}
      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Sales */}
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-500/10 via-emerald-50/50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800">إجمالي المبيعات</span>
                <div className="rounded-lg bg-emerald-500/20 p-1.5 text-emerald-700">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono text-emerald-700">
                  {report.sales.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-emerald-800">{settings.currency}</span>
              </div>
              <p className="mt-1 text-[11px] text-emerald-700 font-medium">
                {report.salesInvoicesCount ?? 0} فاتورة بيع
                {(report.returnsInvoicesCount ?? 0) > 0
                  ? ` • ${report.returnsInvoicesCount} مرتجع`
                  : ''}
              </p>
            </div>

            {/* Purchases */}
            <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-500/10 via-amber-50/50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800">إجمالي المشتريات</span>
                <div className="rounded-lg bg-amber-500/20 p-1.5 text-amber-700">
                  <TrendingDown className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono text-amber-700">
                  {report.purchases.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-amber-800">{settings.currency}</span>
              </div>
              <p className="mt-1 text-[11px] text-amber-700 font-medium">
                {report.purchasesInvoicesCount ?? 0} فاتورة شراء — توريدات المخزن
              </p>
            </div>

            {/* Profit (Accrual vs Collected vs Net) */}
            <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-500/10 via-teal-50/50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-800">الربح المحاسبي الاستحقاقي</span>
                <div className="rounded-lg bg-teal-500/20 p-1.5 text-teal-700">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono text-teal-700">
                  {report.profit.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-teal-800">{settings.currency}</span>
              </div>
              <div className="mt-1.5 space-y-0.5 text-[10px] font-bold">
                <p className="text-emerald-700">
                  محصل نقداً: {(report.collectedProfit ?? 0).toFixed(2)} • آجل: {(report.deferredProfit ?? 0).toFixed(2)}
                </p>
                <p className="text-teal-800">
                  الصافي بعد المصروفات ({report.expenses.toFixed(0)}):{' '}
                  {(report.netProfit ?? report.profit - report.expenses).toFixed(2)} {settings.currency}
                </p>
              </div>
            </div>

            {/* Stock Value */}
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-500/10 via-blue-50/50 to-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800">قيمة بضاعة المخزن</span>
                <div className="rounded-lg bg-blue-500/20 p-1.5 text-blue-700">
                  <Package className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono text-blue-700">
                  {report.stockValue.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-blue-800">{settings.currency}</span>
              </div>
              <p className="mt-1 text-[11px] text-blue-700 font-medium">
                بسعر التكلفة (سعر الشراء)
              </p>
            </div>
          </div>

          {/* Breakdown Section: Top Sold, Top Profit, Low Stock */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top Sold by Quantity */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Award className="h-4 w-4 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">الأكثر مبيعًا (بالكمية)</h3>
              </div>
              <div className="mt-3 space-y-3">
                {report.topSold.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-6">لا توجد مبيعات في هذه الفترة</p>
                ) : (
                  report.topSold.map((it, idx) => {
                    const pct = Math.min(100, (it.v / maxSoldQty) * 100);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-slate-800">
                          <span className="truncate max-w-[70%]">{it.name}</span>
                          <span className="font-mono text-emerald-700 font-bold">{it.v} قطعة</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Top Profit Items */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <TrendingUp className="h-4 w-4 text-teal-600" />
                <h3 className="font-bold text-slate-800 text-sm">الأكثر تحقيقًا للأرباح</h3>
              </div>
              <div className="mt-3 space-y-3">
                {report.topProfit.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-6">لا توجد أرباح مسجلة في هذه الفترة</p>
                ) : (
                  report.topProfit.map((it, idx) => {
                    const pct = Math.min(100, (it.v / maxProfitVal) * 100);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-slate-800">
                          <span className="truncate max-w-[70%]">{it.name}</span>
                          <span className="font-mono text-teal-700 font-bold">
                            {it.v.toFixed(2)} {settings.currency}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Low Stock Warning */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <h3 className="font-bold text-slate-800 text-sm">أصناف قاربت على النفاد (≤ 5)</h3>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {report.lowStock.length === 0 ? (
                  <p className="text-center text-xs text-emerald-600 py-6 font-semibold">
                    جميع الأصناف متوفرة بكميات كافية
                  </p>
                ) : (
                  report.lowStock.map((p) => (
                    <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-800 block">{p.name}</span>
                        <span className="text-[10px] text-slate-400">{p.category}</span>
                      </div>
                      <span className="rounded-lg bg-red-100 px-2 py-0.5 font-bold font-mono text-red-700">
                        {p.qty} قطعة
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
