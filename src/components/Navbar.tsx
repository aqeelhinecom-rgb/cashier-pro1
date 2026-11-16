import React, { useState, useEffect } from 'react';
import {
  Menu,
  ArrowRight,
  Boxes,
  ShoppingCart,
  Users,
  Truck,
  FileSpreadsheet,
  CreditCard,
  Receipt,
  X,
  TrendingUp,
  Sun,
  Moon,
  Settings,
  Edit2,
  Check,
} from 'lucide-react';
import { ScreenId, StoreSettings } from '../types';
import { DB } from '../services/db';
import { useBackHandler } from '../services/navigation';

interface NavbarProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onStepBack?: () => void;
  title?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ currentScreen, onNavigate, onStepBack, title }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settings, setSettings] = useState<StoreSettings>(DB.getSettings());
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useBackHandler(menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    const sync = () => {
      setSettings(DB.getSettings());
    };
    return DB.subscribe(sync);
  }, []);

  const isDark = settings.theme === 'dark';

  const toggleTheme = async () => {
    const nextTheme = isDark ? 'light' : 'dark';
    try {
      await DB.saveSettings({ theme: nextTheme });
    } catch (err) {
      console.error('Failed to toggle theme:', err);
    }
  };

  const startEditingName = () => {
    setNameDraft(settings.storeName || 'Cashier - إدارة حسابات المحلات');
    setIsEditingName(true);
  };

  const saveStoreName = async (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.stopPropagation();
    const trimmed = nameDraft.trim() || 'Cashier - إدارة حسابات المحلات';
    try {
      await DB.saveSettings({ storeName: trimmed });
    } catch (err) {
      console.error('Failed to save store name:', err);
    }
    setIsEditingName(false);
  };

  const cancelEditingName = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsEditingName(false);
  };

  const navItems: { id: ScreenId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: 'الرئيسية', icon: Boxes },
    { id: 'products', label: 'مخزن المنتجات', icon: Boxes },
    { id: 'sale', label: 'المبيعات (فاتورة جديدة)', icon: TrendingUp },
    { id: 'purchase', label: 'المشتريات (توريد)', icon: ShoppingCart },
    { id: 'customers', label: 'العملاء', icon: Users },
    { id: 'suppliers', label: 'الموردين', icon: Truck },
    { id: 'expenses', label: 'المصروفات', icon: CreditCard },
    { id: 'accounts', label: 'ادارة الحسابات', icon: FileSpreadsheet },
    { id: 'invoices_sale', label: 'فواتير البيع', icon: Receipt },
    { id: 'invoices_purchase', label: 'فواتير الشراء', icon: ShoppingCart },
    { id: 'invoices_return', label: 'فواتير المرتجع', icon: Receipt },
    { id: 'invoices_quote', label: 'عروض الأسعار', icon: FileSpreadsheet },
    { id: 'backup', label: 'الإعدادات والنسخ الاحتياطي', icon: Settings },
  ];

  const handleItemClick = (id: ScreenId) => {
    setMenuOpen(false);
    onNavigate(id);
  };

  return (
    <>
      <header
        dir="rtl"
        className="sticky top-0 z-40 bg-[#1e4663] text-white border-b border-[#16354b] shadow-xs transition-colors"
      >
        <div className="max-w-lg sm:max-w-2xl mx-auto px-2.5 sm:px-4 h-12 sm:h-14 flex items-center justify-between gap-2">
          {currentScreen === 'home' ? (
            <>
              {/* Home Header: Menu button on right, Store Name on left */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setMenuOpen(true)}
                  className="p-1.5 sm:p-2 rounded-xl text-white hover:bg-white/10 transition"
                  title="القائمة الرئيسية"
                >
                  <Menu className="h-5 w-5 sm:h-6 sm:w-6 stroke-2" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white transition text-xs font-bold shrink-0"
                  title={isDark ? 'التحويل إلى النمط النهاري' : 'التحويل إلى النمط الليلي'}
                >
                  {isDark ? (
                    <>
                      <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-300" />
                      <span className="hidden sm:inline">نهاري</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-100" />
                      <span className="hidden sm:inline">ليلي</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <img
                    src="/app-icon.svg"
                    alt="POS"
                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl shadow-xs border border-white/20 bg-white/10 p-0.5 object-contain shrink-0"
                  />
                  <h1
                    onClick={!isEditingName ? startEditingName : undefined}
                    title={!isEditingName ? 'اضغط لتغيير الاسم' : undefined}
                    className={`text-sm sm:text-lg font-black text-white tracking-tight flex items-center gap-1 min-w-0 ${
                      !isEditingName ? 'cursor-pointer group hover:text-teal-200 transition-colors' : ''
                    }`}
                  >
                    {isEditingName ? (
                      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveStoreName(e);
                            if (e.key === 'Escape') cancelEditingName();
                          }}
                          autoFocus
                          placeholder="اسم المحل..."
                          className="bg-white/15 text-white placeholder-white/50 border border-white/30 rounded-lg px-2 py-0.5 text-xs sm:text-sm font-black focus:outline-hidden focus:border-teal-300 w-32 sm:w-52"
                        />
                        <button
                          type="button"
                          onClick={saveStoreName}
                          className="p-1 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white transition shrink-0"
                          title="حفظ الاسم"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingName}
                          className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition shrink-0"
                          title="إلغاء"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <>
                        <span className="truncate max-w-[165px] sm:max-w-[260px]">
                          {settings.storeName || 'Cashier - إدارة حسابات المحلات'}
                        </span>
                        <Edit2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
                      </>
                    )}
                  </h1>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Section Header: Only Back button on right & Section Title on left */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => (onStepBack ? onStepBack() : onNavigate('home'))}
                  className="p-1.5 sm:p-2 rounded-xl text-white hover:bg-white/10 transition flex items-center gap-1"
                  title="رجوع"
                >
                  <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6 stroke-2" />
                </button>
              </div>

              <h1 className="text-base sm:text-lg font-extrabold text-white tracking-wide truncate">
                {title}
              </h1>
            </>
          )}
        </div>
      </header>

      {/* Slide-out Sidebar Drawer opening from the RIGHT side in RTL */}
      {menuOpen && (
        <div
          dir="rtl"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-50 flex justify-start bg-black/60 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-64 sm:w-72 bg-white h-full shadow-2xl flex flex-col p-3.5 sm:p-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src="/app-icon.svg"
                  alt="POS"
                  className="h-9 w-9 rounded-2xl shadow-sm border border-slate-200 object-contain p-0.5 bg-slate-50 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-black text-sm text-[#1e4663] leading-snug truncate">
                    {settings.storeName || 'Cashier - إدارة حسابات المحلات'}
                  </h3>
                  <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-1.5 py-0.5 rounded-md inline-block">
                    نظام نقاط البيع والمخزن
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2.5 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs sm:text-sm font-bold text-right transition ${
                      isActive
                        ? 'bg-[#1e4663] text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2.5 border-t border-slate-100 text-center text-[11px] text-slate-400">
              <p className="font-bold text-slate-700">تطبيق كاشير المحلات</p>
              <p>العملة: {settings.currency} • الخط: {settings.fontFamily || 'Cairo'}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
