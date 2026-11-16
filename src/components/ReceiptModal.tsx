import React from 'react';
import { X, Printer, Copy, Check, Store, FileDown } from 'lucide-react';
import { Invoice, InvoiceItem } from '../types';
import { DB } from '../services/db';
import { BarcodeSvg } from './BarcodeSvg';
import { exportInvoiceToPdf } from '../utils/pdfExport';

interface ReceiptModalProps {
  invoice: Invoice | null;
  items: InvoiceItem[];
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  invoice,
  items,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const settings = DB.getSettings();

  if (!isOpen || !invoice) return null;

  const isSale = invoice.type === 'sale' || invoice.type === 'sale_return' || invoice.type === 'quote';
  const typeTitle =
    invoice.type === 'sale'
      ? 'فاتورة بيع'
      : invoice.type === 'purchase'
      ? 'فاتورة شراء'
      : invoice.type === 'sale_return'
      ? 'فاتورة مرتجع'
      : 'عرض سعر';
  const remaining = Math.max(0, invoice.total - invoice.paid);
  const invCurrency = invoice.currency || settings.currency;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportInvoiceToPdf(invoice, items, settings);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCopy = () => {
    const textLines = [
      `=== ${settings.storeName} ===`,
      `${typeTitle} #${invoice.id}`,
      `التاريخ: ${new Date(invoice.date).toLocaleString('ar-SA')}`,
      `الطرف: ${invoice.party_name || 'مفرد'}`,
      '--------------------------------',
      ...items.map((it) => `${it.name} | ${it.qty} × ${it.price} = ${(it.qty * it.price).toFixed(2)} ${invCurrency}`),
      '--------------------------------',
      `الخصم: ${invoice.discount.toFixed(2)} ${invCurrency}`,
      `الإجمالي: ${invoice.total.toFixed(2)} ${invCurrency}`,
      `المدفوع: ${invoice.paid.toFixed(2)} ${invCurrency}`,
      remaining > 0 ? `المتبقي: ${remaining.toFixed(2)} ${invCurrency}` : 'مدفوع بالكامل',
      '--------------------------------',
      settings.receiptFooter,
    ];
    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden m-auto"
      >
        {/* Modal Controls Header (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-teal-600" />
            <h3 className="font-bold text-slate-800">إيصال الفاتورة #{invoice.id}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Printable Thermal Receipt Area */}
        <div id="printable-receipt" className="p-6 bg-white text-slate-900 select-text">
          {/* Store Info */}
          <div className="text-center pb-3 border-b border-dashed border-slate-300">
            <div className="flex justify-center mb-1">
              <div className="h-10 w-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-700">
                <Store className="h-5 w-5" />
              </div>
            </div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">{settings.storeName}</h2>
            {settings.phone && <p className="text-xs text-slate-600 mt-0.5">هاتف: {settings.phone}</p>}
            {settings.address && <p className="text-xs text-slate-500">{settings.address}</p>}
          </div>

          {/* Invoice Meta */}
          <div className="py-2.5 border-b border-dashed border-slate-300 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">رقم الفاتورة:</span>
              <span className="font-bold font-mono">#{invoice.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">نوع الفاتورة:</span>
              <span className="font-semibold text-teal-700">{typeTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">التاريخ والوقت:</span>
              <span className="font-mono text-[11px]">
                {new Date(invoice.date).toLocaleDateString('ar-SA')} - {new Date(invoice.date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{isSale ? 'العميل:' : 'المورد:'}</span>
              <span className="font-bold">{invoice.party_name || 'مفرد'}</span>
            </div>
          </div>

          {/* Items Table */}
          <div className="py-2.5 border-b border-dashed border-slate-300">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                  <th className="py-1">الصنف</th>
                  <th className="py-1 text-center">الكمية</th>
                  <th className="py-1 text-center">السعر</th>
                  <th className="py-1 text-left">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={idx} className="text-slate-800">
                    <td className="py-1.5 font-medium">{item.name}</td>
                    <td className="py-1.5 text-center font-mono">{item.qty}</td>
                    <td className="py-1.5 text-center font-mono">{item.price.toFixed(0)}</td>
                    <td className="py-1.5 text-left font-mono font-bold">{(item.qty * item.price).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown */}
          <div className="py-2.5 border-b border-dashed border-slate-300 text-xs space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>المجموع الفرعي:</span>
              <span className="font-mono">
                {items.reduce((acc, it) => acc + it.qty * it.price, 0).toFixed(0)} {invCurrency}
              </span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>الخصم الممنوح:</span>
                <span className="font-mono">-{invoice.discount.toFixed(0)} {invCurrency}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1 border-t border-slate-200">
              <span>الإجمالي النهائي:</span>
              <span className="font-mono text-teal-700">{invoice.total.toFixed(0)} {invCurrency}</span>
            </div>
            <div className="flex justify-between text-slate-700 pt-0.5">
              <span>المدفوع نقدًا/شبكة:</span>
              <span className="font-mono">{invoice.paid.toFixed(0)} {invCurrency}</span>
            </div>
            {remaining > 0 ? (
              <div className="flex justify-between font-bold text-red-600 pt-0.5">
                <span>المتبقي (آجل):</span>
                <span className="font-mono">{remaining.toFixed(0)} {invCurrency}</span>
              </div>
            ) : (
              <div className="text-center py-1 mt-1 rounded bg-teal-50 text-teal-700 font-bold text-[11px]">
                تم السداد بالكامل
              </div>
            )}
          </div>

          {/* Barcode & Footer */}
          <div className="pt-4 text-center space-y-2">
            <BarcodeSvg value={`INV-${invoice.id.toString().padStart(6, '0')}`} width={160} height={40} />
            <p className="text-[11px] text-slate-500 font-medium">{settings.receiptFooter}</p>
          </div>
        </div>

        {/* Action Buttons (Hidden in Print) */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2.5 px-3 text-xs sm:text-sm font-bold text-white hover:bg-teal-700 shadow-xs transition"
          >
            <Printer className="h-4 w-4" />
            طباعة
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#1e4663] py-2.5 px-3 text-xs sm:text-sm font-bold text-white hover:bg-[#16354b] shadow-xs transition disabled:opacity-60"
          >
            <FileDown className="h-4 w-4" />
            {exportingPdf ? 'جاري PDF...' : 'PDF'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            title="نسخ النص"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'تم' : 'نسخ'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-100 transition"
          >
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
};
