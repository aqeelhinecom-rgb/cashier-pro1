import React, { useState, useEffect } from 'react';
import {
  Users,
  Truck,
  Plus,
  Phone,
  Search,
  DollarSign,
  History,
  Trash2,
  Receipt,
  FileDown,
  Share2,
  PlusCircle,
} from 'lucide-react';
import { DB } from '../services/db';
import { Party, PartyType, Invoice, Payment } from '../types';
import { playSuccessChime } from '../services/audio';
import { useBackHandler } from '../services/navigation';
import { exportReportToPdf } from '../utils/pdfExport';

interface PartiesScreenProps {
  type: PartyType;
}

export const PartiesScreen: React.FC<PartiesScreenProps> = ({ type }) => {
  const isCustomer = type === 'customer';
  const settings = DB.getSettings();

  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'debt'>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [openingDebt, setOpeningDebt] = useState('');

  // Payment / Debt adjustment modal state
  const [paymentParty, setPaymentParty] = useState<Party | null>(null);
  const [transactionMode, setTransactionMode] = useState<'payment' | 'add_debt'>('payment');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Statement History modal state
  const [historyParty, setHistoryParty] = useState<Party | null>(null);
  const [historyData, setHistoryData] = useState<{ invoices: Invoice[]; payments: Payment[] }>({
    invoices: [],
    payments: [],
  });
  const [exportingStatement, setExportingStatement] = useState(false);

  // In-app delete confirmation state
  const [confirmDeleteParty, setConfirmDeleteParty] = useState<Party | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useBackHandler(addModalOpen, () => setAddModalOpen(false));
  useBackHandler(paymentParty !== null, () => setPaymentParty(null));
  useBackHandler(historyParty !== null, () => setHistoryParty(null));
  useBackHandler(confirmDeleteParty !== null, () => setConfirmDeleteParty(null));

  const loadParties = () => {
    let list = DB.getParties(type);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.phone && p.phone.includes(q))
      );
    }
    if (balanceFilter === 'debt') {
      list = list.filter((p) => (p.balance || 0) > 0);
    }
    setParties(list);
  };

  useEffect(() => {
    loadParties();
    return DB.subscribe(loadParties);
  }, [type, search, balanceFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const created = await DB.addParty(newName.trim(), newPhone.trim(), type);
      const initialDebtNum = parseFloat(openingDebt);
      if (initialDebtNum && initialDebtNum > 0) {
        await DB.addPayment(created.id, -initialDebtNum, 'رصيد افتتاحي / دين سابق');
      }
      playSuccessChime();
      setNewName('');
      setNewPhone('');
      setOpeningDebt('');
      setAddModalOpen(false);
    } catch (err) {
      console.error('Failed to create party:', err);
      alert('حدث خطأ أثناء حفظ جهة التعامل');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentParty || isSubmitting) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;

    try {
      setIsSubmitting(true);
      if (transactionMode === 'add_debt') {
        await DB.addPayment(
          paymentParty.id,
          -amount,
          paymentNotes.trim() || (isCustomer ? 'دين إضافي مسجل' : 'مستحق إضافي للمورد')
        );
      } else {
        await DB.addPayment(paymentParty.id, amount, paymentNotes);
      }
      playSuccessChime();
      setPaymentParty(null);
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (err) {
      console.error('Failed to record payment:', err);
      alert('حدث خطأ أثناء تسجيل الدفعة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenHistory = (p: Party) => {
    setHistoryParty(p);
    setHistoryData(DB.getPartyHistory(p.id));
  };

  const handleExportStatementPdf = async (share = false) => {
    if (!historyParty) return;
    setExportingStatement(true);
    try {
      const formatInvoiceLabel = (inv: Invoice) => {
        const ref = inv.invoice_number || `#${inv.id}`;
        if (inv.type === 'sale_return') return `مرتجع بيع ${ref}`;
        if (inv.type === 'purchase') return `فاتورة شراء ${ref}`;
        if (inv.type === 'quote') return `عرض سعر ${ref}`;
        return `فاتورة بيع ${ref}`;
      };

      const formatInvoiceBalanceEffect = (inv: Invoice) => {
        if (inv.type === 'quote') return '0 (عرض سعر)';
        const diff = Math.max(0, inv.total - inv.paid);
        if (diff === 0) return '0';
        if (inv.type === 'sale_return') return `-${diff.toFixed(0)} (خصم من الدين)`;
        return `+${diff.toFixed(0)}`;
      };

      const rows: (string | number)[][] = [
        ...historyData.invoices.map((inv) => [
          new Date(inv.date).toISOString().split('T')[0],
          formatInvoiceLabel(inv),
          inv.type === 'sale_return' ? `-${inv.total.toFixed(0)}` : inv.total.toFixed(0),
          inv.paid.toFixed(0),
          formatInvoiceBalanceEffect(inv),
        ]),
        ...historyData.payments.map((pay) => [
          new Date(pay.date).toISOString().split('T')[0],
          pay.amount < 0
            ? `دين مسجل (${pay.notes || 'رصيد إضافي'})`
            : `دفعة مسددة (${pay.notes || 'نقدي'})`,
          pay.amount < 0 ? Math.abs(pay.amount).toFixed(0) : '0',
          pay.amount > 0 ? pay.amount.toFixed(0) : '0',
          pay.amount < 0 ? `+${Math.abs(pay.amount).toFixed(0)}` : `-${pay.amount.toFixed(0)}`,
        ]),
      ];

      await exportReportToPdf({
        reportTitle: `كشف حساب ${isCustomer ? 'العميل' : 'المورد'}: ${historyParty.name}`,
        reportDate: new Date().toISOString().split('T')[0],
        columns: [
          'التاريخ',
          'البيان / الحركة',
          `إجمالي الحركة (${settings.currency})`,
          `المدفوع (${settings.currency})`,
          `الأثر على الرصيد (${settings.currency})`,
        ],
        rows,
        summaryCards: [
          { label: isCustomer ? 'اسم العميل' : 'اسم المورد', value: historyParty.name },
          {
            label: isCustomer ? 'إجمالي الدين المتبقي عليه' : 'إجمالي المستحق له',
            value: `${(historyParty.balance || 0).toFixed(0)} ${settings.currency}`,
          },
          {
            label: 'عدد الحركات المسجلة',
            value: `${rows.length} حركة`,
          },
        ],
        supplierName: !isCustomer ? historyParty.name : undefined,
        supplierPhone: !isCustomer ? historyParty.phone : undefined,
        settings,
        options: {
          share,
          shareTitle: `كشف حساب ${historyParty.name}`,
          shareText: `كشف حساب ${historyParty.name} - الرصيد الصافي: ${(
            historyParty.balance || 0
          ).toFixed(0)} ${settings.currency}`,
        },
      });
    } finally {
      setExportingStatement(false);
    }
  };

  const allPartiesOfType = DB.getParties(type);
  const totalBalance = allPartiesOfType.reduce((acc, p) => acc + Math.max(0, p.balance || 0), 0);
  const debtPartiesCount = allPartiesOfType.filter((p) => (p.balance || 0) > 0).length;

  return (
    <div dir="rtl" className="space-y-4">
      {/* Top Action Bar: Filter + Add New Party */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-xs">
          <button
            type="button"
            onClick={() => setBalanceFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              balanceFilter === 'all'
                ? 'bg-[#1e4663] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الكل ({allPartiesOfType.length})
          </button>
          <button
            type="button"
            onClick={() => setBalanceFilter('debt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              balanceFilter === 'debt'
                ? 'bg-[#b91c1c] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isCustomer ? `عليهم ديون (${debtPartiesCount})` : `لهم مستحقات (${debtPartiesCount})`}
          </button>
        </div>

        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-[#1e4663] hover:bg-[#16354b] px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-xs transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>{isCustomer ? 'إضافة عميل جديد' : 'إضافة مورد جديد'}</span>
        </button>
      </div>

      {/* Summary Balance Card & Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs md:col-span-1">
          <span className="text-xs font-semibold text-slate-500">
            {isCustomer ? 'إجمالي المتبقي على العملاء (الديون):' : 'إجمالي المستحق للموردين:'}
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className={`text-2xl font-black font-mono ${
                totalBalance > 0 ? 'text-[#b91c1c]' : 'text-emerald-700'
              }`}
            >
              {totalBalance.toFixed(0)}
            </span>
            <span className="text-xs font-bold text-slate-600">{settings.currency}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs md:col-span-2 flex items-center">
          <div className="relative w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`بحث بالاسم أو رقم هاتف ${isCustomer ? 'العميل' : 'المورد'}...`}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm pl-8 focus:border-[#1e4663] focus:bg-white focus:outline-hidden"
            />
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Parties List */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        {parties.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            {isCustomer ? (
              <Users className="mx-auto h-12 w-12 text-slate-300 stroke-1" />
            ) : (
              <Truck className="mx-auto h-12 w-12 text-slate-300 stroke-1" />
            )}
            <p className="mt-2 text-sm font-medium text-slate-600">
              لا يوجد {isCustomer ? 'عملاء' : 'موردين'} مطابقين للعرض
            </p>
            <button
              onClick={() => setAddModalOpen(true)}
              className="mt-3 text-xs font-bold text-[#1e4663] hover:underline"
            >
              + إضافة {isCustomer ? 'عميل جديد' : 'مورد جديد'}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {parties.map((p) => {
              const bal = p.balance || 0;
              const hasDebt = bal > 0;

              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50/70 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#1e4663]/10 text-[#1e4663] flex items-center justify-center font-black text-sm">
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">{p.name}</h3>
                      {p.phone ? (
                        <a
                          href={`tel:${p.phone}`}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#1e4663] mt-0.5"
                          dir="ltr"
                        >
                          <Phone className="h-3 w-3" />
                          <span>{p.phone}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">بدون هاتف</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    {/* Balance */}
                    <div className="text-left">
                      <span className="text-[11px] text-slate-400 block">
                        {isCustomer ? (hasDebt ? 'عليه (دين مستحق)' : 'لا يوجد دين') : 'المستحق له'}
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`text-lg font-black font-mono ${
                            hasDebt ? 'text-[#b91c1c]' : 'text-emerald-700'
                          }`}
                        >
                          {bal.toFixed(0)}
                        </span>
                        <span className="text-xs font-bold text-slate-500">{settings.currency}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTransactionMode('payment');
                          setPaymentParty(p);
                          setPaymentAmount(Math.max(0, bal).toString());
                        }}
                        className="flex items-center gap-1 rounded-xl bg-[#0d9488] hover:bg-teal-700 px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer"
                        title={isCustomer ? 'تحصيل دفعة نقدية' : 'سداد دفعة للمورد'}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>{isCustomer ? 'تحصيل' : 'سداد'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTransactionMode('add_debt');
                          setPaymentParty(p);
                          setPaymentAmount('');
                        }}
                        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition cursor-pointer"
                        title={isCustomer ? 'تسجيل دين جديد على العميل' : 'تسجيل مستحق جديد للمورد'}
                      >
                        <PlusCircle className="h-3.5 w-3.5 text-[#b91c1c]" />
                        <span>+ دين</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenHistory(p)}
                        className="p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1e4663] rounded-xl transition cursor-pointer"
                        title="كشف الحساب وتصدير PDF"
                      >
                        <History className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteParty(p)}
                        className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Modal (With optional opening balance / previous debt) */}
      {addModalOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1e4663] mb-3">
              {isCustomer ? 'تسجيل عميل جديد' : 'تسجيل مورد جديد'}
            </h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الاسم <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: عبد الله أحمد"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#1e4663] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="07xxxxxxxxx"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#1e4663] focus:outline-hidden"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isCustomer
                    ? `رصيد دين سابق على العميل (${settings.currency}) - اختياري`
                    : `رصيد مستحق سابق للمورد (${settings.currency}) - اختياري`}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={openingDebt}
                  onChange={(e) => setOpeningDebt(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-bold focus:border-[#1e4663] focus:outline-hidden"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#1e4663] hover:bg-[#16354b] py-2.5 text-sm font-extrabold text-white"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment / Add Debt Modal */}
      {paymentParty && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-3">
              <button
                type="button"
                onClick={() => setTransactionMode('payment')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-extrabold transition ${
                  transactionMode === 'payment'
                    ? 'bg-[#0d9488] text-white shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                {isCustomer ? 'تحصيل دفعة (-)' : 'سداد دفعة (-)'}
              </button>
              <button
                type="button"
                onClick={() => setTransactionMode('add_debt')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-extrabold transition ${
                  transactionMode === 'add_debt'
                    ? 'bg-[#b91c1c] text-white shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                {isCustomer ? 'تسجيل دين جديد (+)' : 'إضافة مستحق (+)'}
              </button>
            </div>

            <h3 className="text-base font-bold text-slate-800 mb-1">
              {transactionMode === 'payment'
                ? isCustomer
                  ? `تحصيل دفعة من ${paymentParty.name}`
                  : `سداد دفعة إلى ${paymentParty.name}`
                : isCustomer
                ? `تسجيل دين على ${paymentParty.name}`
                : `تسجيل مستحق لـ ${paymentParty.name}`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              الرصيد الحالي:{' '}
              <span className="font-bold font-mono">{(paymentParty.balance || 0).toFixed(0)}</span>{' '}
              {settings.currency}
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  المبلغ ({settings.currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-base font-mono font-bold text-slate-900 focus:border-[#1e4663] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  ملاحظات وبيان العملية
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder={
                    transactionMode === 'payment'
                      ? 'مثال: دفعة نقدية / زين كاش...'
                      : 'مثال: بضاعة على الحساب / دين سابق...'
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#1e4663] focus:outline-hidden"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentParty(null)}
                  className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold text-white ${
                    transactionMode === 'payment'
                      ? 'bg-[#0d9488] hover:bg-teal-700'
                      : 'bg-[#b91c1c] hover:bg-red-800'
                  }`}
                >
                  تأكيد وحفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Statement / Ledger History Modal with PDF Export & Share */}
      {historyParty && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#1e4663] text-white px-4 py-3">
              <div>
                <h3 className="font-bold text-sm">كشف حساب: {historyParty.name}</h3>
                <span className="text-xs text-slate-200">
                  الرصيد الصافي: {(historyParty.balance || 0).toFixed(0)} {settings.currency}
                </span>
              </div>
              <button
                onClick={() => setHistoryParty(null)}
                className="rounded-lg p-1 text-white/80 hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {/* Invoices section */}
              <div>
                <h4 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-[#1e4663]" />
                  الفواتير المسجلة ({historyData.invoices.length})
                </h4>
                {historyData.invoices.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 p-2.5 rounded-xl text-center">
                    لا توجد فواتير
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {historyData.invoices.map((inv) => {
                      const isReturn = inv.type === 'sale_return';
                      const isQuote = inv.type === 'quote';
                      const diff = Math.max(0, inv.total - inv.paid);
                      const typeLabel = isReturn
                        ? 'مرتجع بيع'
                        : inv.type === 'purchase'
                        ? 'فاتورة شراء'
                        : isQuote
                        ? 'عرض سعر'
                        : 'فاتورة بيع';
                      const displayRef = inv.invoice_number || `#${inv.id}`;
                      return (
                        <div
                          key={inv.id}
                          className={`flex items-center justify-between text-xs p-2.5 rounded-xl border ${
                            isReturn
                              ? 'border-teal-200 bg-teal-50/50'
                              : isQuote
                              ? 'border-slate-200 bg-slate-50/40'
                              : 'border-slate-100 bg-slate-50/70'
                          }`}
                        >
                          <div>
                            <span
                              className={`font-bold ${
                                isReturn ? 'text-teal-800' : 'text-slate-800'
                              }`}
                            >
                              {typeLabel} {displayRef}
                            </span>
                            <span className="text-slate-400 mr-2">
                              {new Date(inv.date).toLocaleDateString('ar-SA')}
                            </span>
                          </div>
                          <div className="text-left font-mono">
                            <span
                              className={`font-bold ${
                                isReturn ? 'text-teal-700' : 'text-slate-900'
                              }`}
                            >
                              {isReturn ? `-${inv.total.toFixed(0)}` : inv.total.toFixed(0)}
                            </span>
                            {isQuote ? (
                              <span className="text-slate-400 text-[10px] font-bold block">
                                غير مرحّل
                              </span>
                            ) : isReturn && diff > 0 ? (
                              <span className="text-emerald-700 text-[10px] font-bold block">
                                خصم من الدين {diff.toFixed(0)}
                              </span>
                            ) : diff > 0 ? (
                              <span className="text-[#b91c1c] text-[10px] font-bold block">
                                متبقي {diff.toFixed(0)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payments & Adjustments section */}
              <div>
                <h4 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-[#0d9488]" />
                  سجل الدفعات والديون المسجلة ({historyData.payments.length})
                </h4>
                {historyData.payments.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 p-2.5 rounded-xl text-center">
                    لا توجد دفعات مسجلة
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {historyData.payments.map((pay) => {
                      const isAddedDebt = pay.amount < 0;
                      return (
                        <div
                          key={pay.id}
                          className={`flex items-center justify-between text-xs p-2.5 rounded-xl border ${
                            isAddedDebt
                              ? 'border-red-100 bg-red-50/50'
                              : 'border-emerald-100 bg-emerald-50/50'
                          }`}
                        >
                          <div>
                            <span
                              className={`font-bold ${
                                isAddedDebt ? 'text-[#b91c1c]' : 'text-emerald-800'
                              }`}
                            >
                              {isAddedDebt ? 'دين إضافي مسجل' : 'دفعة نقدية مسددة'}
                            </span>
                            <span className="text-slate-400 mr-2">
                              {new Date(pay.date).toLocaleDateString('ar-SA')}
                            </span>
                            {pay.notes && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{pay.notes}</p>
                            )}
                          </div>
                          <span
                            className={`font-black font-mono ${
                              isAddedDebt ? 'text-[#b91c1c]' : 'text-emerald-700'
                            }`}
                          >
                            {isAddedDebt
                              ? `+${Math.abs(pay.amount).toFixed(0)}`
                              : `-${pay.amount.toFixed(0)}`}{' '}
                            {settings.currency}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Statement Footer Actions: PDF & Share */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={exportingStatement}
                onClick={() => handleExportStatementPdf(true)}
                className="flex items-center gap-1.5 rounded-xl bg-[#0d9488] hover:bg-teal-700 text-white px-3.5 py-2 text-xs font-extrabold transition cursor-pointer disabled:opacity-60"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>مشاركة كشف الحساب PDF</span>
              </button>
              <button
                type="button"
                disabled={exportingStatement}
                onClick={() => handleExportStatementPdf(false)}
                className="flex items-center gap-1.5 rounded-xl bg-[#1e4663] hover:bg-[#16354b] text-white px-3.5 py-2 text-xs font-extrabold transition cursor-pointer disabled:opacity-60"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>تحميل كشف حساب PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Delete Confirmation Modal */}
      {confirmDeleteParty && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl text-center space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              تأكيد حذف {isCustomer ? 'العميل' : 'المورد'}
            </h3>
            <p className="text-xs text-slate-600">
              هل أنت متأكد من حذف &quot;{confirmDeleteParty.name}&quot;؟
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteParty(null)}
                className="flex-1 rounded-xl border border-slate-300 py-2 text-xs font-bold text-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  if (isSubmitting) return;
                  try {
                    setIsSubmitting(true);
                    await DB.deleteParty(confirmDeleteParty.id);
                    playSuccessChime();
                    setConfirmDeleteParty(null);
                  } catch (err) {
                    console.error('Failed to delete party:', err);
                    alert('حدث خطأ أثناء حذف جهة التعامل');
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="flex-1 rounded-xl bg-[#b91c1c] py-2 text-xs font-extrabold text-white disabled:opacity-50"
              >
                {isSubmitting ? 'جاري الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
