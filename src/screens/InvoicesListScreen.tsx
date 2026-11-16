import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, X } from 'lucide-react';
import { DB } from '../services/db';
import { Invoice, InvoiceItem, InvoiceType } from '../types';
import { ReceiptModal } from '../components/ReceiptModal';
import { useBackHandler } from '../services/navigation';
import { exportInvoiceToPdf } from '../utils/pdfExport';
import { playSuccessChime } from '../services/audio';

interface InvoicesListScreenProps {
  type: InvoiceType;
}

export const InvoicesListScreen: React.FC<InvoicesListScreenProps> = ({ type }) => {
  const settings = DB.getSettings();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Popup menu state when tapping an invoice row (matching Screenshot 1)
  const [activeMenuInvoice, setActiveMenuInvoice] = useState<Invoice | null>(null);

  // Receipt Modal state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedItems, setSelectedItems] = useState<InvoiceItem[]>([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);

  useBackHandler(activeMenuInvoice !== null, () => setActiveMenuInvoice(null));
  useBackHandler(receiptOpen, () => setReceiptOpen(false));
  useBackHandler(searchExpanded && search !== '', () => {
    setSearch('');
    setSearchExpanded(false);
  });

  const loadInvoices = () => {
    const list = DB.getInvoices(type);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      setInvoices(
        list.filter(
          (inv) =>
            inv.id.toString().includes(q) ||
            (inv.party_name || 'مفرد').toLowerCase().includes(q) ||
            inv.date.slice(0, 10).includes(q)
        )
      );
    } else {
      setInvoices(list);
    }
  };

  useEffect(() => {
    loadInvoices();
    return DB.subscribe(loadInvoices);
  }, [type, search]);

  const formatDateYMD = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return isoStr.slice(0, 10);
    }
  };

  const handleViewInvoice = (inv: Invoice) => {
    const items = DB.getInvoiceItems(inv.id);
    setSelectedInvoice(inv);
    setSelectedItems(items);
    setActiveMenuInvoice(null);
    setReceiptOpen(true);
  };

  const handleDeleteInvoice = async (inv: Invoice) => {
    if (isDeleting === inv.id) return;
    try {
      setIsDeleting(inv.id);
      await DB.deleteInvoice(inv.id);
      playSuccessChime();
      setActiveMenuInvoice(null);
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      alert('حدث خطأ أثناء إلغاء الفاتورة');
    } finally {
      setIsDeleting(null);
    }
  };

  const handlePrintInvoice = (inv: Invoice) => {
    const items = DB.getInvoiceItems(inv.id);
    setSelectedInvoice(inv);
    setSelectedItems(items);
    setActiveMenuInvoice(null);
    setReceiptOpen(true);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handlePdfInvoice = async (inv: Invoice) => {
    const items = DB.getInvoiceItems(inv.id);
    setActiveMenuInvoice(null);
    setExportingPdfId(inv.id);
    try {
      await exportInvoiceToPdf(inv, items, settings);
    } finally {
      setExportingPdfId(null);
    }
  };

  return (
    <div dir="rtl" className="space-y-2.5 max-w-3xl mx-auto">
      {/* Top Right "بحث 🔍" matching Screenshot 4 & Screenshot 1 */}
      <div className="flex items-center justify-between px-1 pt-1">
        {!searchExpanded ? (
          <button
            type="button"
            onClick={() => {
              setSearchExpanded(true);
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-bold text-base py-1 px-1.5 rounded-lg transition cursor-pointer"
          >
            <span>بحث</span>
            <Search className="h-5 w-5 text-slate-500 stroke-[2.2]" />
          </button>
        ) : (
          <div className="flex items-center gap-2 w-full bg-white rounded-xl border border-slate-300 px-3 py-2 shadow-xs">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم الفاتورة أو اسم العميل أو التاريخ..."
              className="w-full text-sm text-slate-800 focus:outline-hidden text-right bg-transparent"
            />
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSearchExpanded(false);
              }}
              className="text-slate-400 hover:text-slate-700 p-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main Table Container matching Screenshot 4 */}
      <div className="overflow-visible">
        {/* Dark Slate-Blue Rounded Header Bar: Right "تفاصيل الفاتورة" | Left "اجمالي الفاتورة" */}
        <div className="bg-[#1e4663] text-white rounded-t-2xl px-4 py-2.5 flex items-center justify-between text-sm sm:text-base font-bold shadow-xs">
          <span>تفاصيل الفاتورة</span>
          <span>اجمالي الفاتورة</span>
        </div>

        {/* Invoice Rows */}
        {invoices.length === 0 ? (
          <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 py-16 text-center text-slate-400">
            <FileText className="mx-auto h-12 w-12 text-slate-300 stroke-1" />
            <p className="mt-2 text-sm font-bold text-slate-600">لا توجد فواتير مسجلة</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {invoices.map((inv) => {
              const isMenuOpen = activeMenuInvoice?.id === inv.id;
              const isExporting = exportingPdfId === inv.id;

              return (
                <div
                  key={inv.id}
                  onClick={() => setActiveMenuInvoice(isMenuOpen ? null : inv)}
                  className="relative bg-[#f5f6f8] hover:bg-slate-200/60 transition px-4 py-3.5 flex items-center justify-between cursor-pointer select-none"
                >
                  {/* Right side: Party name ("مفرد"), "فاتورة رقم: 1", "YYYY-MM-DD" */}
                  <div className="space-y-0.5 text-right">
                    <div className="text-base sm:text-lg font-extrabold text-slate-800 leading-snug">
                      {inv.party_name || 'مفرد'}
                    </div>
                    <div className="text-sm sm:text-base font-semibold text-slate-700 leading-snug">
                      فاتورة رقم: {inv.id}
                    </div>
                    <div className="text-sm sm:text-base font-mono font-semibold text-slate-600 leading-snug">
                      {formatDateYMD(inv.date)}
                    </div>
                  </div>

                  {/* Left side: Bold Red Total e.g. "15000" */}
                  <div className="text-left pl-2">
                    <span className="text-base sm:text-lg font-bold font-mono text-[#b91c1c]">
                      {isExporting ? 'جاري PDF...' : inv.total.toFixed(0)}
                    </span>
                  </div>

                  {/* Floating Action Popup Card on Row Tap (matching Screenshot 1) */}
                  {isMenuOpen && (
                    <>
                      {/* Invisible backdrop to close menu when tapping outside */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuInvoice(null);
                        }}
                        className="fixed inset-0 z-40"
                      />

                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-4 top-2 z-50 w-56 rounded-2xl bg-white border border-slate-200/90 shadow-2xl py-2 px-4 flex flex-col items-end space-y-1 text-right"
                      >
                        <button
                          type="button"
                          onClick={() => handleViewInvoice(inv)}
                          className="w-full text-right py-2 text-base font-bold text-slate-800 hover:text-[#1e4663] hover:bg-slate-50 rounded-lg px-2 transition cursor-pointer"
                        >
                          عرض الفاتورة
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvoice(inv)}
                          className="w-full text-right py-2 text-base font-bold text-slate-800 hover:text-red-600 hover:bg-red-50/60 rounded-lg px-2 transition cursor-pointer"
                        >
                          حذف الفاتورة
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintInvoice(inv)}
                          className="w-full text-right py-2 text-base font-bold text-slate-800 hover:text-[#1e4663] hover:bg-slate-50 rounded-lg px-2 transition cursor-pointer"
                        >
                          طباعة الفاتورة
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePdfInvoice(inv)}
                          className="w-full text-right py-2 text-base font-bold font-mono text-slate-800 hover:text-[#1e4663] hover:bg-slate-50 rounded-lg px-2 transition cursor-pointer"
                        >
                          pdf
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Receipt Preview Modal */}
      <ReceiptModal
        isOpen={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        invoice={selectedInvoice}
        items={selectedItems}
      />
    </div>
  );
};
