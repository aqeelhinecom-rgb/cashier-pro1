import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, Camera, HardDrive, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { ScreenId } from './types';
import { DB, StorageInitState } from './services/db';
import {
  pushBackEntry,
  removeBackEntry,
  triggerStepBack,
  onRootExitPrompt,
} from './services/navigation';
import { Navbar } from './components/Navbar';
import { HomeScreen } from './screens/HomeScreen';
import { InvoiceScreen } from './screens/InvoiceScreen';
import { ProductsScreen } from './screens/ProductsScreen';
import { PartiesScreen } from './screens/PartiesScreen';
import { InvoicesListScreen } from './screens/InvoicesListScreen';
import { AccountsScreen } from './screens/AccountsScreen';
import { ExpensesScreen } from './screens/ExpensesScreen';
import { BackupScreen } from './screens/BackupScreen';

export default function App() {
  // Initialization Gate State (المرحلة 3C: حظر تشغيل الواجهات قبل اكتمال التهيئة)
  const [initState, setInitState] = useState<StorageInitState>(() => DB.getStorageState());
  const [initError, setInitError] = useState<string | null>(null);

  const [screenStack, setScreenStack] = useState<ScreenId[]>(['home']);
  const screenEntriesRef = useRef<ReturnType<typeof pushBackEntry>[]>([]);

  // Double-tap-to-exit toast state
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const exitToastTimeoutRef = useRef<number | null>(null);

  // One-time first-install permissions prompt state
  const [showFirstTimePermissions, setShowFirstTimePermissions] = useState<boolean>(
    () => !DB.isPermissionsGranted()
  );

  const currentScreen = screenStack[screenStack.length - 1] || 'home';

  const handleNavigate = useCallback((nextScreen: ScreenId) => {
    setScreenStack((prev) => {
      const current = prev[prev.length - 1];
      if (current === nextScreen) return prev;

      if (nextScreen === 'home') {
        while (screenEntriesRef.current.length > 0) {
          const entry = screenEntriesRef.current.pop();
          if (entry) removeBackEntry(entry);
        }
        return ['home'];
      }

      const entry = pushBackEntry(() => {
        screenEntriesRef.current.pop();
        setScreenStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : ['home']));
      });
      screenEntriesRef.current.push(entry);

      return [...prev, nextScreen];
    });
  }, []);

  const handleStepBack = useCallback(() => {
    const handled = triggerStepBack();
    if (!handled && currentScreen !== 'home') {
      handleNavigate('home');
    }
  }, [currentScreen, handleNavigate]);

  // Subscribe to root exit prompt (1st tap on Back button at Home screen)
  useEffect(() => {
    return onRootExitPrompt(() => {
      setExitToastVisible(true);
      if (exitToastTimeoutRef.current) {
        window.clearTimeout(exitToastTimeoutRef.current);
      }
      exitToastTimeoutRef.current = window.setTimeout(() => {
        setExitToastVisible(false);
      }, 2000);
    });
  }, []);

  // Startup Initialization Gate (المرحلة 3C)
  useEffect(() => {
    let isMounted = true;
    async function initApp() {
      try {
        setInitState(StorageInitState.INITIALIZING);
        const ok = await DB.initializeAsync();
        if (!isMounted) return;
        if (ok) {
          setInitState(StorageInitState.READY);
          setShowFirstTimePermissions(!DB.isPermissionsGranted());
          setInitError(null);
        } else {
          setInitState(StorageInitState.FAILED);
          const lastErr = DB.getLastStorageError();
          setInitError(lastErr?.message || 'تعذر تهيئة محرك التخزين المحلي');
        }
      } catch (err: any) {
        if (!isMounted) return;
        setInitState(StorageInitState.FAILED);
        setInitError(err?.message || 'حدث خطأ غير متوقع أثناء بدء تشغيل التطبيق');
      }
    }

    initApp();

    return () => {
      isMounted = false;
    };
  }, []);

  // Grant permissions once on first install and persist settings automatically
  const handleGrantFirstTimePermissions = async () => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch {
      // Ignore storage persistence error
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      // Ignore if camera is unavailable or declined; never ask again
    }

    await DB.grantPermissionsOnce();
    setShowFirstTimePermissions(false);
  };

  // Disable automatic browser scroll restoration and always start every screen from the very top
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [currentScreen]);

  // Apply font family, font size, and dark/light theme reactively from settings
  useEffect(() => {
    const applyAppearance = () => {
      const s = DB.getSettings();
      const root = document.documentElement;
      const isMobileViewport = window.innerWidth < 640;
      const baseFontSize = s.fontSize || 15;
      // Scale slightly on compact phone screens so all cards and tables fit without overflow
      const effectiveFontSize = isMobileViewport ? Math.min(baseFontSize, 15) : baseFontSize;
      root.style.setProperty('--app-font', `'${s.fontFamily || 'Cairo'}', sans-serif`);
      root.style.fontSize = `${effectiveFontSize}px`;
      root.style.setProperty('--products-font-size', `${s.productsFontSize || 14}px`);
      if (s.theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyAppearance();
    window.addEventListener('resize', applyAppearance);
    const unsub = DB.subscribe(applyAppearance);
    return () => {
      window.removeEventListener('resize', applyAppearance);
      unsub();
    };
  }, []);

  // Keyboard shortcut navigation (F1: sale, F2: purchase, Esc: step back)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        handleNavigate('sale');
      } else if (e.key === 'F2') {
        e.preventDefault();
        handleNavigate('purchase');
      } else if (e.key === 'Escape' && currentScreen !== 'home') {
        e.preventDefault();
        handleStepBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScreen, handleNavigate, handleStepBack]);

  const getScreenTitle = (screen: ScreenId): string => {
    switch (screen) {
      case 'home':
        return '';
      case 'sale':
        return 'فاتورة بيع جديدة';
      case 'purchase':
        return 'فاتورة شراء جديدة';
      case 'sale_return':
        return 'فاتورة مرتجع جديدة';
      case 'quote':
        return 'عرض سعر جديد';
      case 'products':
        return 'مخزن المنتجات';
      case 'customers':
        return 'العملاء';
      case 'suppliers':
        return 'الموردين';
      case 'invoices_sale':
        return 'فواتير البيع';
      case 'invoices_purchase':
        return 'فواتير الشراء';
      case 'invoices_return':
        return 'فواتير المرتجع';
      case 'invoices_quote':
        return 'عروض الاسعار';
      case 'accounts':
        return 'ادارة الحسابات';
      case 'expenses':
        return 'المصروفات';
      case 'backup':
        return 'الإعدادات والنسخ الاحتياطي';
      default:
        return '';
    }
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen onNavigate={handleNavigate} />;
      case 'sale':
        return <InvoiceScreen type="sale" onBack={handleStepBack} onNavigate={handleNavigate} />;
      case 'purchase':
        return <InvoiceScreen type="purchase" onBack={handleStepBack} onNavigate={handleNavigate} />;
      case 'sale_return':
        return (
          <InvoiceScreen type="sale_return" onBack={handleStepBack} onNavigate={handleNavigate} />
        );
      case 'quote':
        return <InvoiceScreen type="quote" onBack={handleStepBack} onNavigate={handleNavigate} />;
      case 'products':
        return <ProductsScreen />;
      case 'customers':
        return <PartiesScreen type="customer" />;
      case 'suppliers':
        return <PartiesScreen type="supplier" />;
      case 'invoices_sale':
        return <InvoicesListScreen type="sale" />;
      case 'invoices_purchase':
        return <InvoicesListScreen type="purchase" />;
      case 'invoices_return':
        return <InvoicesListScreen type="sale_return" />;
      case 'invoices_quote':
        return <InvoicesListScreen type="quote" />;
      case 'accounts':
        return <AccountsScreen />;
      case 'expenses':
        return <ExpensesScreen />;
      case 'backup':
        return <BackupScreen />;
      default:
        return <HomeScreen onNavigate={handleNavigate} />;
    }
  };

  // 1. Loading Gate (أثناء الفحص والتهيئة)
  if (initState === StorageInitState.INITIALIZING || initState === StorageInitState.UNINITIALIZED) {
    return (
      <div dir="rtl" className="min-h-dvh bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-16 h-16 rounded-3xl bg-[#1e4663] border border-slate-700/80 flex items-center justify-center shadow-2xl mb-4 animate-pulse">
          <HardDrive className="h-8 w-8 text-teal-400" />
        </div>
        <h1 className="text-xl font-black mb-1 tracking-wide">Cashier Pro</h1>
        <p className="text-xs text-slate-400 mb-6 font-medium">جاري فحص وتهيئة محرك التخزين وقاعدة البيانات...</p>
        <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-teal-500 rounded-full animate-pulse w-3/4" />
        </div>
      </div>
    );
  }

  // 2. Error Gate (إذا فشلت التهيئة مع إمكانية إعادة المحاولة)
  if (initState === StorageInitState.FAILED) {
    return (
      <div dir="rtl" className="min-h-dvh bg-slate-100 flex flex-col items-center justify-center p-6 text-slate-900 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-xl border border-red-100 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="text-base font-black text-slate-900">تعذر بدء تشغيل قاعدة البيانات</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            {initError || 'حدث خطأ أثناء الاتصال بمحرك التخزين المحلي. يرجى التأكد من تفعيل التخزين في المتصفح أو إعادة المحاولة.'}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={async () => {
                setInitState(StorageInitState.INITIALIZING);
                const ok = await DB.initializeAsync();
                if (ok) {
                  setInitState(StorageInitState.READY);
                  setShowFirstTimePermissions(!DB.isPermissionsGranted());
                  setInitError(null);
                } else {
                  setInitState(StorageInitState.FAILED);
                  setInitError(DB.getLastStorageError()?.message || 'فشلت إعادة المحاولة');
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#1e4663] hover:bg-[#16354b] text-white text-xs font-black shadow-md transition cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-100/70 text-slate-900 flex flex-col selection:bg-slate-700 selection:text-white transition-colors duration-200">
      {/* Top Navigation */}
      <Navbar
        currentScreen={currentScreen}
        onNavigate={handleNavigate}
        onStepBack={handleStepBack}
        title={getScreenTitle(currentScreen)}
      />

      {/* Main App Content - Mobile-First Container */}
      <main key={currentScreen} className="flex-1 max-w-lg sm:max-w-2xl w-full mx-auto px-2.5 py-2.5 sm:p-4">
        {renderScreen()}
      </main>

      {/* First-Time Only Permissions Modal (Shown once on first app install/launch) */}
      {showFirstTimePermissions && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl space-y-3.5 text-right">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-[#1e4663] text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  منح أذونات التطبيق (لأول مرة فقط)
                </h3>
                <p className="text-[11px] text-slate-500">
                  يتم طلب هذه الأذونات عند التثبيت لأول مرة فقط وتُحفظ الإعدادات تلقائياً بعدها
                </p>
              </div>
            </div>

            <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <Camera className="h-4 w-4 text-[#1e4663] shrink-0" />
                <span>إذن الكاميرا لقراءة الباركود السريع للمنتجات</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <HardDrive className="h-4 w-4 text-[#1e4663] shrink-0" />
                <span>إذن الذاكرة لحفظ الفواتير وملفات PDF والإعدادات تلقائياً</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGrantFirstTimePermissions}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#1e4663] hover:bg-[#16354b] py-3 px-4 text-xs sm:text-sm font-extrabold text-white shadow-md transition active:scale-98 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>سماح وحفظ الإعدادات تلقائياً</span>
            </button>
          </div>
        </div>
      )}

      {/* Double-Tap Back to Exit Toast */}
      {exitToastVisible && (
        <div
          dir="rtl"
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 rounded-full bg-slate-900/90 text-white px-4 py-2 text-xs font-bold shadow-xl pointer-events-none whitespace-nowrap"
        >
          اضغط مرة أخرى للخروج من التطبيق
        </div>
      )}

      {/* Bottom Footer Bar (Desktop only so mobile has full vertical space) */}
      <footer className="hidden sm:block mt-auto border-t border-slate-200/80 bg-white py-2.5 px-4 text-xs text-slate-500 print:hidden">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#1e4663]">{DB.getSettings().storeName || 'Cashier'}</span>
            <span aria-hidden="true">·</span>
            <span>نظام إدارة المبيعات والمخازن</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500">
            <span>
              اختصارات لوحة المفاتيح: <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-mono">F1</kbd> بيع · <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-mono">F2</kbd> شراء
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
