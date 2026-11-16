import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  FileDown,
  Share2,
  CheckSquare,
  Square,
  Plus,
  Trash2,
} from 'lucide-react';
import { DB } from '../services/db';
import { Invoice, Product, Expense, Party } from '../types';
import { useBackHandler } from '../services/navigation';
import { exportReportToPdf } from '../utils/pdfExport';

type MainTab = 'overview' | 'aggregated' | 'reports';
type OverviewSubTab = 'sales' | 'profit' | 'topSold' | 'topProfit';
type AggregatedSubTab = 'sales' | 'purchases' | 'expenses';

interface SwipeStep {
  mainTab: MainTab;
  overviewSubTab?: OverviewSubTab;
  aggregatedSubTab?: AggregatedSubTab;
  label: string;
}

const ALL_SWIPE_STEPS: SwipeStep[] = [
  { mainTab: 'overview', overviewSubTab: 'sales', label: 'نظرة عامة • المبيعات' },
  { mainTab: 'overview', overviewSubTab: 'profit', label: 'نظرة عامة • الأرباح' },
  { mainTab: 'overview', overviewSubTab: 'topSold', label: 'نظرة عامة • الأكثر مبيعاً' },
  { mainTab: 'overview', overviewSubTab: 'topProfit', label: 'نظرة عامة • الأكثر ربحاً' },
  { mainTab: 'aggregated', aggregatedSubTab: 'sales', label: 'بيانات مجمعة • المبيعات' },
  { mainTab: 'aggregated', aggregatedSubTab: 'purchases', label: 'بيانات مجمعة • المشتريات' },
  { mainTab: 'aggregated', aggregatedSubTab: 'expenses', label: 'بيانات مجمعة • المصروفات' },
  { mainTab: 'reports', label: 'التقارير المفصلة' },
];

const MAIN_ONLY_STEPS: SwipeStep[] = [
  { mainTab: 'overview', label: 'نظرة عامة' },
  { mainTab: 'aggregated', label: 'بيانات مجمعة' },
  { mainTab: 'reports', label: 'التقارير' },
];

export const AccountsScreen: React.FC = () => {
  const [mainTab, setMainTab] = useState<MainTab>('overview');
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>('sales');
  const [aggregatedSubTab, setAggregatedSubTab] = useState<AggregatedSubTab>('sales');
  const [swipeScope] = useState<'all' | 'main'>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('اليوم');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedReportDetail, setSelectedReportDetail] = useState<string | null>(null);

  useBackHandler(selectedReportDetail !== null, () => setSelectedReportDetail(null));

  // Drag / Swipe state for smooth visual feedback from anywhere on the screen
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; active: boolean; isHorizontal: boolean | null }>({
    x: 0,
    y: 0,
    active: false,
    isHorizontal: null,
  });

  const settings = DB.getSettings();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const loadAll = () => {
    setInvoices(DB.getInvoices());
    setProducts(DB.getProducts());
    setExpenses(DB.getExpenses());
  };

  useEffect(() => {
    loadAll();
    return DB.subscribe(loadAll);
  }, []);

  // Get current step index
  const getCurrentStepIndex = useCallback(() => {
    if (swipeScope === 'main') {
      return MAIN_ONLY_STEPS.findIndex((s) => s.mainTab === mainTab);
    }
    if (mainTab === 'overview') {
      return ALL_SWIPE_STEPS.findIndex(
        (s) => s.mainTab === 'overview' && s.overviewSubTab === overviewSubTab
      );
    }
    if (mainTab === 'aggregated') {
      return ALL_SWIPE_STEPS.findIndex(
        (s) => s.mainTab === 'aggregated' && s.aggregatedSubTab === aggregatedSubTab
      );
    }
    return ALL_SWIPE_STEPS.findIndex((s) => s.mainTab === 'reports');
  }, [mainTab, overviewSubTab, aggregatedSubTab, swipeScope]);

  const applyStep = useCallback((step: SwipeStep) => {
    setMainTab(step.mainTab);
    if (step.overviewSubTab) {
      setOverviewSubTab(step.overviewSubTab);
    }
    if (step.aggregatedSubTab) {
      setAggregatedSubTab(step.aggregatedSubTab);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const navigateByStep = useCallback(
    (direction: 1 | -1) => {
      const steps = swipeScope === 'main' ? MAIN_ONLY_STEPS : ALL_SWIPE_STEPS;
      const currentIdx = Math.max(0, getCurrentStepIndex());
      const nextIdx = (currentIdx + direction + steps.length) % steps.length;
      applyStep(steps[nextIdx]);
    },
    [swipeScope, getCurrentStepIndex, applyStep]
  );

  // Global touch & mouse drag listeners so user can swipe left/right from ANYWHERE on the screen
  useEffect(() => {
    if (selectedReportDetail) return;

    const isInteractiveElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'option') {
        return true;
      }
      return false;
    };

    const handleStart = (clientX: number, clientY: number, target: EventTarget | null) => {
      if (isInteractiveElement(target)) return;
      dragStartRef.current = {
        x: clientX,
        y: clientY,
        active: true,
        isHorizontal: null,
      };
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!dragStartRef.current.active) return;
      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;

      if (dragStartRef.current.isHorizontal === null) {
        if (Math.abs(dx) > 14 || Math.abs(dy) > 10) {
          dragStartRef.current.isHorizontal = Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.4;
          if (dragStartRef.current.isHorizontal) {
            setIsDragging(true);
          }
        }
      }

      if (dragStartRef.current.isHorizontal) {
        // Clamp visual drag offset for smooth elastic feel
        const clamped = Math.max(-140, Math.min(140, dx * 0.55));
        setDragOffset(clamped);
      }
    };

    const handleEnd = (clientX: number) => {
      if (!dragStartRef.current.active) return;
      const dx = clientX - dragStartRef.current.x;
      const wasHorizontal = dragStartRef.current.isHorizontal;

      dragStartRef.current.active = false;
      dragStartRef.current.isHorizontal = null;
      setIsDragging(false);
      setDragOffset(0);

      if (wasHorizontal && Math.abs(dx) > 42) {
        // In RTL layout, tabs are ordered from Right to Left:
        // Swiping Right (dx > 0) pulls the left tab into view (step +1)
        // Swiping Left (dx < 0) pulls the right tab into view (step -1)
        if (dx > 0) {
          navigateByStep(1);
        } else {
          navigateByStep(-1);
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length > 0) {
        handleEnd(e.changedTouches[0].clientX);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      handleStart(e.clientX, e.clientY, e.target);
    };

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const onMouseUp = (e: MouseEvent) => {
      handleEnd(e.clientX);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInteractiveElement(e.target)) return;
      if (e.key === 'ArrowLeft') {
        navigateByStep(1);
      } else if (e.key === 'ArrowRight') {
        navigateByStep(-1);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedReportDetail, navigateByStep]);

  // Helper to compute metrics for any period
  const getPeriodRange = (period: string): { start: Date; end: Date } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (period) {
      case 'اليوم':
        return { start: today, end: endOfDay };
      case 'امس': {
        const y = new Date(today);
        y.setDate(today.getDate() - 1);
        const yEnd = new Date(y);
        yEnd.setHours(23, 59, 59);
        return { start: y, end: yEnd };
      }
      case 'الشهر الحالي': {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: s, end: endOfDay };
      }
      case 'الشهر الماضي': {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return { start: s, end: e };
      }
      case 'العام الحالي': {
        const s = new Date(now.getFullYear(), 0, 1);
        return { start: s, end: endOfDay };
      }
      case 'العام الماضي': {
        const s = new Date(now.getFullYear() - 1, 0, 1);
        const e = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
        return { start: s, end: e };
      }
      case 'مدى العمل':
      default:
        return { start: new Date(2020, 0, 1), end: new Date(2035, 11, 31) };
    }
  };

  const getMetricsForPeriod = (period: string) => {
    const { start, end } = getPeriodRange(period);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const periodInvoices = invoices.filter((i) => i.date >= startIso && i.date <= endIso);
    const periodExpenses = expenses.filter((e) => e.date >= startIso && e.date <= endIso);

    const grossSales = periodInvoices.filter((i) => i.type === 'sale').reduce((sum, i) => sum + i.total, 0);
    const returnsTotal = periodInvoices.filter((i) => i.type === 'sale_return').reduce((sum, i) => sum + i.total, 0);
    const sales = grossSales - returnsTotal;

    const grossSalesPaid = periodInvoices.filter((i) => i.type === 'sale').reduce((sum, i) => sum + i.paid, 0);
    const returnsPaid = periodInvoices.filter((i) => i.type === 'sale_return').reduce((sum, i) => sum + i.paid, 0);
    const salesPaid = grossSalesPaid - returnsPaid;
    const salesRemain = Math.max(0, sales - salesPaid);

    const purchases = periodInvoices.filter((i) => i.type === 'purchase').reduce((sum, i) => sum + i.total, 0);
    const purchasesPaid = periodInvoices.filter((i) => i.type === 'purchase').reduce((sum, i) => sum + i.paid, 0);
    const purchasesRemain = Math.max(0, purchases - purchasesPaid);

    const expensesTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

    const rep = DB.getReport(start, end);

    return {
      sales,
      salesPaid,
      salesRemain,
      purchases,
      purchasesPaid,
      purchasesRemain,
      expensesTotal,
      profit: rep.profit,
      collectedProfit: rep.collectedProfit ?? 0,
      deferredProfit: rep.deferredProfit ?? 0,
      netProfit: rep.netProfit ?? rep.profit - rep.expenses,
      topSold: rep.topSold,
      topProfit: rep.topProfit,
    };
  };

  // Periods for Overview Screen
  const overviewPeriods = ['اليوم', 'امس', 'الشهر الحالي', 'الشهر الماضي', 'العام الحالي', 'مدى العمل'];

  const periodsDropdown = [
    'اليوم',
    'امس',
    'الشهر الحالي',
    'الشهر الماضي',
    'العام الحالي',
    'العام الماضي',
    'مدى العمل',
  ];

  const currentAggregatedMetrics = getMetricsForPeriod(periodFilter);
  const activeSteps = swipeScope === 'main' ? MAIN_ONLY_STEPS : ALL_SWIPE_STEPS;
  const currentStepIdx = Math.max(0, getCurrentStepIndex());

  return (
    <div
      className={`space-y-4 max-w-4xl mx-auto min-h-[calc(100dvh-150px)] touch-pan-y ${
        isDragging ? 'select-none cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* Main 3 Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-slate-200/80 p-1 rounded-2xl text-center text-sm font-extrabold">
        <button
          onClick={() => setMainTab('overview')}
          className={`py-2.5 rounded-xl transition ${
            mainTab === 'overview'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          نظرة عامة
        </button>
        <button
          onClick={() => setMainTab('aggregated')}
          className={`py-2.5 rounded-xl transition ${
            mainTab === 'aggregated'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          بيانات مجمعة
        </button>
        <button
          onClick={() => setMainTab('reports')}
          className={`py-2.5 rounded-xl transition ${
            mainTab === 'reports'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          التقارير
        </button>
      </div>

      {/* Interactive Swipeable Content Container */}
      <div
        style={{
          transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
        className="space-y-4"
      >
        {/* TAB 1: نظرة عامة (Overview) */}
        {mainTab === 'overview' && (
          <div className="space-y-4">
            {/* Subtabs bar */}
            <div className="flex border-b border-slate-200 bg-slate-700 text-white rounded-t-xl overflow-x-auto text-xs font-bold">
              <button
                onClick={() => setOverviewSubTab('sales')}
                className={`px-4 py-2.5 whitespace-nowrap transition border-b-2 ${
                  overviewSubTab === 'sales'
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                المبيعات
              </button>
              <button
                onClick={() => setOverviewSubTab('profit')}
                className={`px-4 py-2.5 whitespace-nowrap transition border-b-2 ${
                  overviewSubTab === 'profit'
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                الارباح
              </button>
              <button
                onClick={() => setOverviewSubTab('topSold')}
                className={`px-4 py-2.5 whitespace-nowrap transition border-b-2 ${
                  overviewSubTab === 'topSold'
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                المنتجات الأكثر مبيعاً
              </button>
              <button
                onClick={() => setOverviewSubTab('topProfit')}
                className={`px-4 py-2.5 whitespace-nowrap transition border-b-2 ${
                  overviewSubTab === 'topProfit'
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                المنتجات الأكثر ربحاً
              </button>
            </div>

            {/* Cards for each period */}
            <div className="space-y-2.5">
              {overviewPeriods.map((p) => {
                const m = getMetricsForPeriod(p);
                return (
                  <div
                    key={p}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-center min-h-[76px]"
                  >
                    <span className="text-xs font-semibold text-slate-500">{p}</span>
                    <div className="mt-1">
                      {overviewSubTab === 'sales' && (
                        <span className="text-2xl font-black font-mono text-slate-700">
                          {m.sales.toFixed(0)} <span className="text-xs font-bold text-slate-400">{settings.currency}</span>
                        </span>
                      )}
                      {overviewSubTab === 'profit' && (
                        <div>
                          <span className="text-2xl font-black font-mono text-teal-700">
                            {m.profit.toFixed(0)} <span className="text-xs font-bold text-teal-500">{settings.currency}</span>
                          </span>
                          <span className="block text-[11px] font-bold text-slate-500 mt-0.5">
                            ربح استحقاقي • محصل نقداً: {m.collectedProfit.toFixed(0)} {settings.currency} • آجل: {m.deferredProfit.toFixed(0)} {settings.currency}
                          </span>
                        </div>
                      )}
                      {overviewSubTab === 'topSold' && (
                        <div className="text-sm font-bold text-slate-800">
                          {m.topSold.length > 0 ? (
                            m.topSold.map((it, idx) => (
                              <span key={idx} className="block text-slate-700">
                                {idx + 1}. {it.name} ({it.v} قطعة)
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 font-normal">لا توجد مبيعات</span>
                          )}
                        </div>
                      )}
                      {overviewSubTab === 'topProfit' && (
                        <div className="text-sm font-bold text-slate-800">
                          {m.topProfit.length > 0 ? (
                            m.topProfit.map((it, idx) => (
                              <span key={idx} className="block text-teal-700">
                                {idx + 1}. {it.name} ({it.v.toFixed(0)} {settings.currency})
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 font-normal">لا توجد أرباح</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: بيانات مجمعة (Aggregated Data) */}
        {mainTab === 'aggregated' && (
          <div className="space-y-4">
            {/* Subtabs bar */}
            <div className="flex border-b border-slate-200 bg-slate-700 text-white rounded-t-xl overflow-x-auto text-xs font-bold">
              <button
                onClick={() => setAggregatedSubTab('sales')}
                className={`px-5 py-2.5 whitespace-nowrap transition border-b-2 ${
                  aggregatedSubTab === 'sales'
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                المبيعات
              </button>
              <button
                onClick={() => setAggregatedSubTab('purchases')}
                className={`px-5 py-2.5 whitespace-nowrap transition border-b-2 ${
                  aggregatedSubTab === 'purchases'
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                المشتريات
              </button>
              <button
                onClick={() => setAggregatedSubTab('expenses')}
                className={`px-5 py-2.5 whitespace-nowrap transition border-b-2 ${
                  aggregatedSubTab === 'expenses'
                    ? 'border-white bg-slate-800 text-white'
                    : 'border-transparent text-slate-300 hover:text-white'
                }`}
              >
                المصروفات
              </button>
            </div>

            {/* Aggregated Cards */}
            <div className="space-y-3">
              {aggregatedSubTab === 'purchases' && (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500">اجمالي المشتريات</span>
                    <div className="text-2xl font-black font-mono text-slate-800 mt-1">
                      {currentAggregatedMetrics.purchases.toFixed(0)} <span className="text-xs font-bold text-slate-400">{settings.currency}</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500">المسدد</span>
                    <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
                      {currentAggregatedMetrics.purchasesPaid.toFixed(0)} <span className="text-xs font-bold text-emerald-500">{settings.currency}</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500">المتبقي</span>
                    <div className="text-2xl font-black font-mono text-red-600 mt-1">
                      {currentAggregatedMetrics.purchasesRemain.toFixed(0)} <span className="text-xs font-bold text-red-400">{settings.currency}</span>
                    </div>
                  </div>
                </>
              )}

              {aggregatedSubTab === 'sales' && (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500">اجمالي المبيعات</span>
                    <div className="text-2xl font-black font-mono text-slate-800 mt-1">
                      {currentAggregatedMetrics.sales.toFixed(0)} <span className="text-xs font-bold text-slate-400">{settings.currency}</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500">المحصل نقدًا</span>
                    <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
                      {currentAggregatedMetrics.salesPaid.toFixed(0)} <span className="text-xs font-bold text-emerald-500">{settings.currency}</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500">المتبقي (آجل)</span>
                    <div className="text-2xl font-black font-mono text-red-600 mt-1">
                      {currentAggregatedMetrics.salesRemain.toFixed(0)} <span className="text-xs font-bold text-red-400">{settings.currency}</span>
                    </div>
                  </div>
                </>
              )}

              {aggregatedSubTab === 'expenses' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500">اجمالي المصروفات</span>
                  <div className="text-2xl font-black font-mono text-rose-700 mt-1">
                    {currentAggregatedMetrics.expensesTotal.toFixed(0)} <span className="text-xs font-bold text-rose-400">{settings.currency}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Period Selector Button / Dropdown */}
            <div className="flex justify-center pt-2">
              <div className="relative inline-block text-right">
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  className="appearance-none rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 shadow-xs focus:outline-hidden"
                >
                  {periodsDropdown.map((p) => (
                    <option key={p} value={p}>
                      📅 {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: التقارير (Reports Accordion matching video) */}
        {mainTab === 'reports' && (
          <div className="space-y-3">
            {/* Customers */}
            <ReportAccordionItem
              id="customers"
              title="العملاء"
              isExpanded={expandedReport === 'customers'}
              onToggle={() => setExpandedReport(expandedReport === 'customers' ? null : 'customers')}
              items={[
                'تقرير حسابات العملاء',
                'تقرير مديونيات العملاء',
                'تقرير فواتير العملاء',
              ]}
              onSelectReport={(r) => setSelectedReportDetail(r)}
            />

            {/* Purchases */}
            <ReportAccordionItem
              id="purchases"
              title="المشتريات"
              isExpanded={expandedReport === 'purchases'}
              onToggle={() => setExpandedReport(expandedReport === 'purchases' ? null : 'purchases')}
              items={[
                'تقرير مشتريات مفصل',
                'تقرير مشتريات مجمل',
                'تقرير مشتريات بالتصنيف',
                'تقرير الفواتير الغير مسددة',
              ]}
              onSelectReport={(r) => setSelectedReportDetail(r)}
            />

            {/* Suppliers */}
            <ReportAccordionItem
              id="suppliers"
              title="الموردين"
              isExpanded={expandedReport === 'suppliers'}
              onToggle={() => setExpandedReport(expandedReport === 'suppliers' ? null : 'suppliers')}
              items={[
                'تقرير حسابات الموردين',
                'تقرير مستحقات الموردين',
              ]}
              onSelectReport={(r) => setSelectedReportDetail(r)}
            />

            {/* Warehouse */}
            <ReportAccordionItem
              id="warehouse"
              title="المخزن"
              isExpanded={expandedReport === 'warehouse'}
              onToggle={() => setExpandedReport(expandedReport === 'warehouse' ? null : 'warehouse')}
              items={[
                'تقرير جرد المخزن بالأسعار',
                'تقرير النواقص والأصناف المنتهية',
                'تقرير حركة الأصناف',
              ]}
              onSelectReport={(r) => setSelectedReportDetail(r)}
            />

            {/* Expenses */}
            <ReportAccordionItem
              id="expenses"
              title="المصروفات"
              isExpanded={expandedReport === 'expenses'}
              onToggle={() => setExpandedReport(expandedReport === 'expenses' ? null : 'expenses')}
              items={[
                'تقرير المصروفات المفصل',
                'تقرير المصروفات حسب جهة الصرف',
              ]}
              onSelectReport={(r) => setSelectedReportDetail(r)}
            />

            {/* Cash Register / Safe */}
            <ReportAccordionItem
              id="cashbox"
              title="الخزينة"
              isExpanded={expandedReport === 'cashbox'}
              onToggle={() => setExpandedReport(expandedReport === 'cashbox' ? null : 'cashbox')}
              items={[
                'حركات الخزينة',
              ]}
              onSelectReport={(r) => setSelectedReportDetail(r)}
            />

            {/* Bottom Date Indicator */}
            <div className="flex items-center justify-center gap-2 pt-3 text-slate-500 text-xs">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1 font-mono text-xs text-slate-700 bg-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Swipe Pagination Dots & Quick Navigation Bar */}
      <div className="pt-2 pb-4 flex flex-col items-center gap-2">
        <div className="flex items-center gap-1.5">
          {activeSteps.map((step, idx) => {
            const isActive = idx === currentStepIdx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => applyStep(step)}
                title={step.label}
                className={`h-2 rounded-full transition-all ${
                  isActive ? 'w-6 bg-teal-600' : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            );
          })}
        </div>
        <span className="text-[11px] font-bold text-slate-400">
          {activeSteps[currentStepIdx]?.label} — اسحب يميناً أو يساراً للتنقل
        </span>
      </div>

      {/* Report Detail Modal */}
      {selectedReportDetail && (
        <ReportViewerModal
          reportTitle={selectedReportDetail}
          reportDate={reportDate}
          onClose={() => setSelectedReportDetail(null)}
          invoices={invoices}
          products={products}
          expenses={expenses}
        />
      )}
    </div>
  );
};

interface ReportAccordionItemProps {
  id: string;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  items: string[];
  onSelectReport: (reportName: string) => void;
}

const ReportAccordionItem: React.FC<ReportAccordionItemProps> = ({
  title,
  isExpanded,
  onToggle,
  items,
  onSelectReport,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-right hover:bg-slate-50/80 transition"
      >
        <span className="font-bold text-slate-800 text-sm">{title}</span>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-100 bg-slate-50/40">
          {items.map((it, idx) => (
            <button
              key={idx}
              onClick={() => onSelectReport(it)}
              className="w-full text-right p-3.5 pr-6 text-xs font-semibold text-slate-600 hover:bg-teal-50 hover:text-teal-700 transition flex items-center justify-between"
            >
              <span>{it}</span>
              <span className="text-[10px] text-slate-400">عرض ←</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Modal for viewing selected report data & converting to PDF / sharing with supplier
const ReportViewerModal: React.FC<{
  reportTitle: string;
  reportDate: string;
  onClose: () => void;
  invoices: Invoice[];
  products: Product[];
  expenses: Expense[];
}> = ({ reportTitle, reportDate, onClose, invoices, products, expenses }) => {
  const settings = DB.getSettings();
  const currency = settings.currency || 'د.ع';
  const isShortageReport = reportTitle === 'تقرير النواقص والأصناف المنتهية';
  const isWarehouseValuationReport = reportTitle === 'تقرير جرد المخزن بالأسعار';

  const [exportingPdf, setExportingPdf] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);

  // Shortage / Out-of-stock interactive selection states
  const [shortageFilter, setShortageFilter] = useState<'all' | 'out' | 'low'>('all');
  const shortageProducts = products.filter((p) => {
    if (shortageFilter === 'out') return p.qty <= 0;
    if (shortageFilter === 'low') return p.qty > 0 && p.qty <= 5;
    return p.qty <= 5;
  });

  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    products.filter((p) => p.qty <= 0).map((p) => p.id)
  );
  const [requestedQtys, setRequestedQtys] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    products.forEach((p) => {
      if (p.qty <= 5) {
        init[p.id] = Math.max(1, 10 - p.qty);
      }
    });
    return init;
  });

  const suppliers: Party[] = DB.getParties('supplier');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');

  // Custom / Newly written products in the Shortages Request (طلبات النواقص)
  const [customShortageItems, setCustomShortageItems] = useState<
    { id: string; name: string; qty: number; selected: boolean }[]
  >([]);
  const [newShortageName, setNewShortageName] = useState('');
  const [newShortageQty, setNewShortageQty] = useState('10');
  const [saveNewToWarehouse, setSaveNewToWarehouse] = useState(false);

  const handleAddNewShortageItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newShortageName.trim();
    if (!trimmed) return;
    const qtyNum = Math.max(1, parseInt(newShortageQty, 10) || 1);

    if (saveNewToWarehouse) {
      try {
        const created = await DB.saveProduct({
          name: trimmed,
          category: 'عام',
          buy_price: 0,
          sell_price: 0,
          qty: 0,
        });
        setRequestedQtys((prev) => ({ ...prev, [created.id]: qtyNum }));
        setSelectedIds((prev) => (prev.includes(created.id) ? prev : [created.id, ...prev]));
      } catch (err) {
        console.error('Failed to save shortage product to warehouse:', err);
      }
    } else {
      const newEntry = {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        qty: qtyNum,
        selected: true,
      };
      setCustomShortageItems((prev) => [newEntry, ...prev]);
    }

    setNewShortageName('');
    setNewShortageQty('10');
  };

  const toggleCustomShortageItem = (id: string) => {
    setCustomShortageItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const updateCustomShortageQty = (id: string, qty: number) => {
    setCustomShortageItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: Math.max(1, qty || 1) } : item))
    );
  };

  const removeCustomShortageItem = (id: string) => {
    setCustomShortageItems((prev) => prev.filter((item) => item.id !== id));
  };

  useEffect(() => {
    // If no out-of-stock items were initially selected, select all shortage items by default
    if (isShortageReport && selectedIds.length === 0 && shortageProducts.length > 0) {
      setSelectedIds(shortageProducts.map((p) => p.id));
    }
  }, [isShortageReport]);

  const toggleSelectProduct = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectOnlyOutOfStock = () => {
    setShortageFilter('out');
    const outIds = products.filter((p) => p.qty <= 0).map((p) => p.id);
    setSelectedIds(outIds);
  };

  const selectAllVisibleShortages = () => {
    setSelectedIds(shortageProducts.map((p) => p.id));
  };

  // Build structured report data (columns, rows, summaryCards) for any reportTitle
  const buildStructuredReportData = (): {
    columns: string[];
    rows: (string | number)[][];
    summaryCards: { label: string; value: string }[];
  } => {
    // 1. تقرير جرد المخزن بالأسعار (Warehouse Purchase Valuation Report)
    if (isWarehouseValuationReport) {
      const totalBuyValue = products.reduce((sum, p) => sum + p.qty * p.buy_price, 0);
      const totalQty = products.reduce((sum, p) => sum + p.qty, 0);
      return {
        summaryCards: [
          {
            label: 'إجمالي قيمة البضاعة في المخزن (بيش اشتريتها)',
            value: `${totalBuyValue.toFixed(0)} ${currency}`,
          },
          {
            label: 'إجمالي عدد القطع بالمخزن',
            value: `${totalQty} قطعة`,
          },
          {
            label: 'عدد الأصناف المسجلة',
            value: `${products.length} صنف`,
          },
        ],
        columns: [
          'السلعة / المنتج',
          'الكمية الموجودة',
          `سعر الشراء للمفرد (${currency})`,
          `قيمة السلعة بالمخزن (${currency})`,
        ],
        rows: products.map((p) => [
          p.name,
          p.qty,
          p.buy_price.toFixed(0),
          (p.qty * p.buy_price).toFixed(0),
        ]),
      };
    }

    // 2. تقرير النواقص والأصناف المنتهية (Selected Out-of-stock / Shortage Items + Custom Written Products)
    if (isShortageReport) {
      const chosenProducts = products.filter((p) => selectedIds.includes(p.id));
      const selectedCustom = customShortageItems.filter((c) => c.selected);
      const warehouseList =
        chosenProducts.length > 0 || selectedCustom.length > 0 ? chosenProducts : shortageProducts;

      const combinedExportItems: { name: string; qty: number }[] = [
        ...selectedCustom.map((c) => ({ name: c.name, qty: c.qty })),
        ...warehouseList.map((p) => ({ name: p.name, qty: requestedQtys[p.id] ?? 10 })),
      ];

      const totalRequestedQty = combinedExportItems.reduce((sum, it) => sum + it.qty, 0);

      return {
        summaryCards: [
          { label: 'عدد الأصناف المطلوبة', value: `${combinedExportItems.length} صنف` },
          { label: 'إجمالي العدد المطلوب', value: `${totalRequestedQty}` },
        ],
        columns: ['#', 'اسم المنتج', 'العدد المطلوب'],
        rows: combinedExportItems.map((it, idx) => [idx + 1, it.name, it.qty]),
      };
    }

    // 3. تقرير حركة الأصناف
    if (reportTitle === 'تقرير حركة الأصناف') {
      const allSaleInvoices = invoices.filter((i) => i.type === 'sale');
      const saleIds = new Set(allSaleInvoices.map((i) => i.id));
      const soldMap = new Map<number, number>();
      allSaleInvoices.forEach((inv) => {
        if (saleIds.has(inv.id)) {
          DB.getInvoiceItems(inv.id).forEach((it) => {
            soldMap.set(it.product_id, (soldMap.get(it.product_id) || 0) + it.qty);
          });
        }
      });

      return {
        summaryCards: [
          { label: 'عدد الأصناف', value: `${products.length}` },
          {
            label: 'قيمة المخزن بسعر الشراء',
            value: `${products.reduce((s, p) => s + p.qty * p.buy_price, 0).toFixed(0)} ${currency}`,
          },
        ],
        columns: ['المنتج', 'الرصيد المتبقي', 'إجمالي المباع', `سعر الشراء (${currency})`, `سعر البيع (${currency})`],
        rows: products.map((p) => [
          p.name,
          p.qty,
          soldMap.get(p.id) || 0,
          p.buy_price.toFixed(0),
          p.sell_price.toFixed(0),
        ]),
      };
    }

    // 4. تقارير العملاء
    if (reportTitle.includes('العملاء')) {
      const customers = DB.getParties('customer');
      const filtered = reportTitle.includes('مديونيات')
        ? customers.filter((c) => (c.balance || 0) > 0)
        : customers;
      const totalDebt = filtered.reduce((s, c) => s + (c.balance || 0), 0);

      if (reportTitle === 'تقرير فواتير العملاء') {
        const saleInvs = invoices.filter((i) => i.type === 'sale');
        return {
          summaryCards: [
            { label: 'عدد فواتير البيع', value: `${saleInvs.length}` },
            {
              label: 'إجمالي المبيعات',
              value: `${saleInvs.reduce((s, i) => s + i.total, 0).toFixed(0)} ${currency}`,
            },
          ],
          columns: ['رقم الفاتورة', 'العميل', 'التاريخ', `الإجمالي (${currency})`, `المدفوع (${currency})`],
          rows: saleInvs.map((inv) => [
            `#${inv.id}`,
            inv.party_name || 'مفرد',
            inv.date.slice(0, 10),
            inv.total.toFixed(0),
            inv.paid.toFixed(0),
          ]),
        };
      }

      return {
        summaryCards: [
          { label: 'عدد العملاء', value: `${filtered.length}` },
          { label: 'إجمالي الديون المتبقية', value: `${totalDebt.toFixed(0)} ${currency}` },
        ],
        columns: ['اسم العميل', 'رقم الهاتف', `الرصيد المتبقي (${currency})`],
        rows: filtered.map((c) => [c.name, c.phone || '-', (c.balance || 0).toFixed(0)]),
      };
    }

    // 5. تقارير الموردين
    if (reportTitle.includes('الموردين')) {
      const sups = DB.getParties('supplier');
      const filtered = reportTitle.includes('مستحقات')
        ? sups.filter((s) => (s.balance || 0) > 0)
        : sups;
      const totalDue = filtered.reduce((s, p) => s + (p.balance || 0), 0);

      return {
        summaryCards: [
          { label: 'عدد الموردين', value: `${filtered.length}` },
          { label: 'إجمالي المستحقات للموردين', value: `${totalDue.toFixed(0)} ${currency}` },
        ],
        columns: ['اسم المورد', 'رقم الهاتف', `المستحق له (${currency})`],
        rows: filtered.map((s) => [s.name, s.phone || '-', (s.balance || 0).toFixed(0)]),
      };
    }

    // 6. تقارير المشتريات والفواتير غير المسددة
    if (reportTitle.includes('مشتريات') || reportTitle.includes('الغير مسددة')) {
      const purchInvs = invoices.filter((i) =>
        reportTitle.includes('الغير مسددة')
          ? i.type === 'purchase' && i.total - i.paid > 0
          : i.type === 'purchase'
      );
      const totalPurch = purchInvs.reduce((s, i) => s + i.total, 0);
      const totalRemain = purchInvs.reduce((s, i) => s + Math.max(0, i.total - i.paid), 0);

      return {
        summaryCards: [
          { label: 'عدد الفواتير', value: `${purchInvs.length}` },
          { label: 'إجمالي المشتريات', value: `${totalPurch.toFixed(0)} ${currency}` },
          { label: 'المتبقي غير المسدد', value: `${totalRemain.toFixed(0)} ${currency}` },
        ],
        columns: [
          'رقم الفاتورة',
          'المورد',
          'التاريخ',
          `الإجمالي (${currency})`,
          `المدفوع (${currency})`,
          `المتبقي (${currency})`,
        ],
        rows: purchInvs.map((inv) => [
          `#${inv.id}`,
          inv.party_name || 'نقدي',
          inv.date.slice(0, 10),
          inv.total.toFixed(0),
          inv.paid.toFixed(0),
          Math.max(0, inv.total - inv.paid).toFixed(0),
        ]),
      };
    }

    // 7. تقارير المصروفات
    if (reportTitle.includes('المصروفات')) {
      const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
      return {
        summaryCards: [
          { label: 'عدد عمليات الصرف', value: `${expenses.length}` },
          { label: 'إجمالي المصروفات', value: `${totalExp.toFixed(0)} ${currency}` },
        ],
        columns: ['جهة الصرف / البيان', 'التاريخ', 'ملاحظات', `المبلغ (${currency})`],
        rows: expenses.map((e) => [
          e.recipient,
          e.date.slice(0, 10),
          e.notes || '-',
          e.amount.toFixed(0),
        ]),
      };
    }

    // 8. حركات الخزينة
    const salesPaid = invoices.filter((i) => i.type === 'sale').reduce((s, i) => s + i.paid, 0);
    const purchPaid = invoices.filter((i) => i.type === 'purchase').reduce((s, i) => s + i.paid, 0);
    const expTotal = expenses.reduce((s, e) => s + e.amount, 0);
    const netCash = salesPaid - purchPaid - expTotal;

    return {
      summaryCards: [
        { label: 'المقبوضات من المبيعات', value: `${salesPaid.toFixed(0)} ${currency}` },
        { label: 'المدفوعات والمصروفات', value: `${(purchPaid + expTotal).toFixed(0)} ${currency}` },
        { label: 'صافي رصيد الخزينة', value: `${netCash.toFixed(0)} ${currency}` },
      ],
      columns: ['البيان', 'النوع', `المبلغ (${currency})`],
      rows: [
        ['إجمالي المقبوضات النقدية من المبيعات', 'وارد (+)', salesPaid.toFixed(0)],
        ['إجمالي المدفوع نقداً للمشتريات', 'صادر (-)', purchPaid.toFixed(0)],
        ['إجمالي المصروفات المسجلة', 'صادر (-)', expTotal.toFixed(0)],
        ['صافي السيولة النقدية في الخزينة', 'الرصيد الصافي', netCash.toFixed(0)],
      ],
    };
  };

  const handleExportPdf = async (shareWithSupplier = false) => {
    if (shareWithSupplier) {
      setSharingPdf(true);
    } else {
      setExportingPdf(true);
    }

    try {
      const data = buildStructuredReportData();
      const chosenSupplier = selectedSupplierId
        ? suppliers.find((s) => s.id === Number(selectedSupplierId))
        : undefined;

      await exportReportToPdf({
        reportTitle:
          isShortageReport && chosenSupplier
            ? `طلبية نواقص وأصناف منتهية - ${chosenSupplier.name}`
            : reportTitle,
        reportDate,
        columns: data.columns,
        rows: data.rows,
        summaryCards: data.summaryCards,
        supplierName: chosenSupplier?.name,
        supplierPhone: chosenSupplier?.phone,
        settings,
        options: {
          share: shareWithSupplier,
          shareTitle: reportTitle,
          shareText: chosenSupplier
            ? `طلبية النواقص والأصناف المنتهية موجهة إلى: ${chosenSupplier.name}`
            : reportTitle,
        },
      });
    } finally {
      setExportingPdf(false);
      setSharingPdf(false);
    }
  };

  const reportData = buildStructuredReportData();

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#1e4663] text-white px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-teal-300" />
            <h3 className="font-bold text-sm sm:text-base">{reportTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
          {/* Summary Cards */}
          {reportData.summaryCards.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {reportData.summaryCards.map((c, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 ${
                    idx === 0
                      ? 'bg-teal-50/70 border-teal-200 text-teal-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <span className="text-[11px] font-bold text-slate-500 block">{c.label}</span>
                  <span className="text-base font-black font-mono mt-0.5 block">{c.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Special Interactive Controls for "تقرير النواقص والأصناف المنتهية" */}
          {isShortageReport ? (
            <div className="space-y-3">
              {/* Filter & Quick Selection Bar */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShortageFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        shortageFilter === 'all'
                          ? 'bg-[#1e4663] text-white'
                          : 'bg-white border border-slate-200 text-slate-700'
                      }`}
                    >
                      الكل ({products.filter((p) => p.qty <= 5).length})
                    </button>
                    <button
                      type="button"
                      onClick={selectOnlyOutOfStock}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        shortageFilter === 'out'
                          ? 'bg-red-600 text-white'
                          : 'bg-red-50 border border-red-200 text-red-700'
                      }`}
                    >
                      المنتهية فقط 0 ({products.filter((p) => p.qty <= 0).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setShortageFilter('low')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        shortageFilter === 'low'
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-50 border border-amber-200 text-amber-700'
                      }`}
                    >
                      النواقص ({products.filter((p) => p.qty > 0 && p.qty <= 5).length})
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold">
                    <button
                      type="button"
                      onClick={selectAllVisibleShortages}
                      className="text-teal-700 hover:underline"
                    >
                      تحديد الكل
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="text-slate-500 hover:underline"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>

                {/* Supplier Selector for Sharing */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-slate-200/70">
                  <label className="text-xs font-bold text-slate-700 shrink-0">
                    مشاركة الطلبية مع المورد:
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) =>
                      setSelectedSupplierId(e.target.value ? Number(e.target.value) : '')
                    }
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden"
                  >
                    <option value="">-- اختر المورد (اختياري) --</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} {sup.phone ? `(${sup.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-[11px] font-bold text-teal-800 bg-teal-50/80 border border-teal-200/80 rounded-lg px-2.5 py-1.5">
                  ملاحظة: يظهر للمورد في ملف الـ PDF فقط (الرقم التسلسلي #، اسم المنتج، والعدد المطلوب) بدون أي أسعار أو رصيد حالي.
                </div>

                {/* Write New Product for Shortage Order */}
                <form
                  onSubmit={handleAddNewShortageItem}
                  className="pt-2.5 border-t border-slate-200/80 space-y-2"
                >
                  <label className="block text-xs font-extrabold text-[#1e4663]">
                    + كتابة منتج جديد وإضافته لطلبية النواقص:
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={newShortageName}
                      onChange={(e) => setNewShortageName(e.target.value)}
                      placeholder="اكتب اسم المنتج أو الصنف المطلوب من المورد..."
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#1e4663] focus:outline-hidden"
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
                        <span className="text-[11px] font-bold text-slate-500">العدد:</span>
                        <input
                          type="number"
                          min="1"
                          value={newShortageQty}
                          onChange={(e) => setNewShortageQty(e.target.value)}
                          className="w-14 text-center font-mono text-xs font-black text-slate-800 focus:outline-hidden"
                        />
                      </div>
                      <button
                        type="submit"
                        className="flex items-center justify-center gap-1 rounded-xl bg-[#1e4663] hover:bg-[#16354b] text-white px-4 py-2 text-xs font-extrabold transition shrink-0 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>إضافة للطلبية</span>
                      </button>
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveNewToWarehouse}
                      onChange={(e) => setSaveNewToWarehouse(e.target.checked)}
                      className="rounded border-slate-300 text-[#1e4663] focus:ring-[#1e4663]"
                    />
                    <span>حفظ هذا المنتج الجديد في مخزن المنتجات أيضاً (برصيد 0)</span>
                  </label>
                </form>
              </div>

              {/* Selectable Shortage Items List (Custom Written Items + Warehouse Shortage Items) */}
              {shortageProducts.length === 0 && customShortageItems.length === 0 ? (
                <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                  لا توجد أصناف منتهية أو ناقصة في هذا الفلتر — يمكنك كتابة منتج جديد بالأعلى
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {/* Custom Written Products */}
                  {customShortageItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => toggleCustomShortageItem(item.id)}
                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition ${
                        item.selected ? 'bg-teal-50/60' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCustomShortageItem(item.id);
                          }}
                          className="text-teal-600"
                        >
                          {item.selected ? (
                            <CheckSquare className="h-5 w-5 text-teal-600" />
                          ) : (
                            <Square className="h-5 w-5 text-slate-400" />
                          )}
                        </button>
                        <div>
                          <div className="font-bold text-slate-900 text-xs sm:text-sm">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-[#0d9488] font-bold mt-0.5">
                            منتج مضاف يدوياً للطلبية
                          </div>
                        </div>
                      </div>

                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        <span className="text-[11px] font-bold text-slate-500">المطلوب:</span>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) =>
                            updateCustomShortageQty(item.id, parseInt(e.target.value, 10) || 1)
                          }
                          className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomShortageItem(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="حذف من الطلبية"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {shortageProducts.map((p) => {
                    const isChecked = selectedIds.includes(p.id);
                    const isOut = p.qty <= 0;
                    const reqQty = requestedQtys[p.id] ?? 10;

                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleSelectProduct(p.id)}
                        className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition ${
                          isChecked ? 'bg-teal-50/40' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectProduct(p.id);
                            }}
                            className="text-teal-600"
                          >
                            {isChecked ? (
                              <CheckSquare className="h-5 w-5 text-teal-600" />
                            ) : (
                              <Square className="h-5 w-5 text-slate-400" />
                            )}
                          </button>
                          <div>
                            <div className="font-bold text-slate-900 text-xs sm:text-sm">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span
                                className={`font-bold px-1.5 py-0.5 rounded ${
                                  isOut
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                الرصيد: {p.qty} {isOut ? '(منتهي)' : '(ناقص)'}
                              </span>
                              <span>•</span>
                              <span>شراء: {p.buy_price.toFixed(0)} {currency}</span>
                            </div>
                          </div>
                        </div>

                        {/* Requested Qty from Supplier */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 shrink-0"
                        >
                          <span className="text-[11px] font-bold text-slate-500">المطلوب:</span>
                          <input
                            type="number"
                            min="1"
                            value={reqQty}
                            onChange={(e) =>
                              setRequestedQtys({
                                ...requestedQtys,
                                [p.id]: Math.max(1, parseInt(e.target.value, 10) || 1),
                              })
                            }
                            className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-slate-800"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Standard Report Table (including Warehouse Purchase Valuation Report) */
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead className="bg-[#1e4663] text-white font-bold text-xs">
                  <tr>
                    {reportData.columns.map((col, idx) => (
                      <th key={idx} className="px-3 py-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {reportData.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={reportData.columns.length}
                        className="py-10 text-center text-slate-400"
                      >
                        لا توجد بيانات مسجلة في هذا التقرير
                      </td>
                    </tr>
                  ) : (
                    reportData.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`px-3 py-2.5 ${
                              cIdx === 0
                                ? 'font-bold text-slate-900'
                                : cIdx === row.length - 1
                                ? 'font-extrabold font-mono text-[#1e4663]'
                                : 'font-mono text-slate-700'
                            }`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions: Convert to PDF & Share with Supplier */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-500">
            {isShortageReport
              ? `تم تحديد (${selectedIds.length + customShortageItems.filter((c) => c.selected).length}) صنف للتصدير`
              : `عدد السجلات: ${reportData.rows.length}`}
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {isShortageReport && (
              <button
                type="button"
                disabled={sharingPdf || exportingPdf}
                onClick={() => handleExportPdf(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                <Share2 className="h-4 w-4" />
                <span>
                  {sharingPdf ? 'جاري التحويل والمشاركة...' : 'تحويل إلى PDF ومشاركته مع المورد'}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={exportingPdf || sharingPdf}
              onClick={() => handleExportPdf(false)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1e4663] text-white font-bold text-xs hover:bg-[#16354b] shadow-xs transition cursor-pointer disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" />
              <span>
                {exportingPdf ? 'جاري تحويل PDF...' : 'طباعة / تحويل إلى ملف PDF'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
