import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Trash2,
  Check,
  FileText,
} from 'lucide-react';
import { DB } from '../services/db';
import { Expense } from '../types';
import { playSuccessChime } from '../services/audio';
import { useBackHandler } from '../services/navigation';

const QUICK_EXPENSE_TYPES = [
  'إيجار المحل',
  'كهرباء ومولد',
  'رواتب وأجور',
  'نقل وتحميل بضاعة',
  'ضيافة ومستلزمات',
];

export const ExpensesScreen: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('add');
  const [search, setSearch] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<Expense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useBackHandler(activeTab === 'list', () => setActiveTab('add'));
  useBackHandler(confirmDeleteExpense !== null, () => setConfirmDeleteExpense(null));

  const settings = DB.getSettings();

  const loadExpenses = () => {
    setExpenses(DB.getExpenses(search));
  };

  useEffect(() => {
    loadExpenses();
    return DB.subscribe(loadExpenses);
  }, [search]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !amount || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await DB.addExpense(recipient.trim(), parseFloat(amount) || 0, new Date(date).toISOString(), notes);
      playSuccessChime();
      setSuccessMsg(true);
      setRecipient('');
      setAmount('');
      setNotes('');
      setTimeout(() => {
        setSuccessMsg(false);
        setActiveTab('list');
      }, 1000);
    } catch (err) {
      console.error('Failed to add expense:', err);
      alert('حدث خطأ أثناء حفظ المصروف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div dir="rtl" className="space-y-4 max-w-3xl mx-auto">
      {/* Top Action Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'add'
                ? 'bg-[#1e4663] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>تسجيل مصروف</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              activeTab === 'list'
                ? 'bg-[#1e4663] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>سجل المصروفات ({expenses.length})</span>
          </button>
        </div>

        <div className="text-left">
          <span className="text-[11px] font-semibold text-slate-500 block">إجمالي المصروفات</span>
          <span className="text-sm font-black font-mono text-[#b91c1c]">
            {totalExpenses.toFixed(0)} {settings.currency}
          </span>
        </div>
      </div>

      {activeTab === 'add' ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <p className="text-xs text-slate-500 font-medium">
            * اختر بند الصرف السريع أو اكتب جهة الصرف يدوياً:
          </p>

          {/* Quick Expense Category Presets */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_EXPENSE_TYPES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRecipient(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  recipient === preset
                    ? 'bg-[#1e4663] text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl flex items-center gap-2 font-bold">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>تم حفظ المصروف بنجاح</span>
            </div>
          )}

          <form onSubmit={handleAddExpense} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-right">
                جهة الصرف / البند
              </label>
              <input
                type="text"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="ادخل جهة الصرف"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#1e4663] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-right">
                المبلغ ({settings.currency})
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="المبلغ"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-bold font-mono focus:border-[#1e4663] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-right">
                التاريخ
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:border-[#1e4663] focus:outline-hidden text-center"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-right">
                ملاحظات إضافية (اختياري)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات حول سبب الصرف..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#1e4663] focus:outline-hidden"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full rounded-xl bg-[#1e4663] py-3 text-base font-extrabold text-white hover:bg-[#16354b] shadow-md transition active:scale-98 cursor-pointer"
              >
                حفظ المصروف
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Expenses List view */
        <div className="space-y-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative w-full">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بجهة الصرف أو الملاحظات..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm pl-8 focus:border-[#1e4663] focus:bg-white focus:outline-hidden"
              />
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {expenses.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <CreditCard className="mx-auto h-12 w-12 text-slate-300 stroke-1" />
                <p className="mt-2 text-sm font-medium text-slate-600">لا توجد مصروفات مسجلة</p>
                <button
                  onClick={() => setActiveTab('add')}
                  className="mt-3 text-xs font-bold text-[#1e4663] hover:underline"
                >
                  + تسجيل أول مصروف
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{e.recipient}</h4>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{new Date(e.date).toLocaleDateString('ar-SA')}</span>
                        {e.notes && <span>· {e.notes}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-black font-mono text-base text-[#b91c1c]">
                        -{e.amount.toFixed(0)} {settings.currency}
                      </span>
                      <button
                        onClick={() => setConfirmDeleteExpense(e)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-[#b91c1c] transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-App Delete Expense Confirmation Modal */}
      {confirmDeleteExpense && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl text-center space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">تأكيد حذف المصروف</h3>
            <p className="text-xs text-slate-600">
              هل أنت متأكد من حذف مصروف &quot;{confirmDeleteExpense.recipient}&quot;؟
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteExpense(null)}
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
                    await DB.deleteExpense(confirmDeleteExpense.id);
                    playSuccessChime();
                    setConfirmDeleteExpense(null);
                  } catch (err) {
                    console.error('Failed to delete expense:', err);
                    alert('حدث خطأ أثناء حذف المصروف');
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
