import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Check,
  X,
  Download,
  AlertCircle,
  Tag,
  ArrowLeftRight,
  CheckSquare,
  Square,
} from 'lucide-react';
import { DB } from '../services/db';
import { Product } from '../types';
import { playSuccessChime } from '../services/audio';
import { useBackHandler } from '../services/navigation';

export interface ImportedExcelProductResult {
  product: Product;
  importedQty: number;
  importedBuyPrice: number;
  chosenSellPrice: number;
}

interface ExcelPreviewRow {
  id: string;
  selected: boolean;
  name: string;
  category: string;
  barcode: string;
  excelQty: number;
  excelBuyPrice: number;
  excelSellPrice: number;
  existingProduct: Product | null;
  oldBuyPrice: number | null;
  oldSellPrice: number | null;
  oldQty: number | null;
  priceChoice: 'new' | 'old' | 'custom';
  finalSellPrice: number;
  finalBuyPrice: number;
}

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: (results: ImportedExcelProductResult[]) => void;
  mode?: 'warehouse' | 'purchase_invoice';
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  mode = 'warehouse',
}) => {
  const [rows, setRows] = useState<ExcelPreviewRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [qtyMode, setQtyMode] = useState<'add' | 'replace'>('add');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useBackHandler(isOpen, onClose);

  if (!isOpen) return null;

  const settings = DB.getSettings();
  const currency = settings.currency || 'د.ع';
  const categories = DB.getCategories();

  const parseNumber = (val: unknown, fallback = 0): number => {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') {
      // Convert Arabic-Indic digits if present and strip non-numeric chars except . and -
      const normalized = val
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[^\d.-]/g, '');
      const num = parseFloat(normalized);
      return isNaN(num) ? fallback : num;
    }
    return fallback;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setErrorMsg('ملف الإكسل فارغ أو لا يحتوي على أي ورقة عمل');
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
      });

      if (!rawJson || rawJson.length === 0) {
        setErrorMsg('لم يتم العثور على صفوف منتجات داخل ملف الإكسل');
        return;
      }

      const existingProducts = DB.getProducts();
      const parsedRows: ExcelPreviewRow[] = [];

      rawJson.forEach((record, idx) => {
        const keys = Object.keys(record);
        const findVal = (patterns: string[]): unknown => {
          for (const k of keys) {
            const cleanK = k.trim().toLowerCase();
            if (patterns.some((p) => cleanK === p || cleanK.includes(p))) {
              return record[k];
            }
          }
          return undefined;
        };

        const rawName =
          findVal(['اسم المنتج', 'المنتج', 'الاسم', 'اسم المادة', 'المادة', 'البيان', 'name', 'product', 'item', 'title']) ??
          (keys[0] ? record[keys[0]] : '');

        const name = String(rawName || '').trim();
        if (!name) return;

        const rawCategory =
          findVal(['الصنف', 'التصنيف', 'الفئة', 'القسم', 'النوع', 'category', 'cat', 'group', 'type']) ?? 'عام';
        const category = String(rawCategory || 'عام').trim() || 'عام';

        const rawBarcode =
          findVal(['الباركود', 'باركود', 'الكود', 'الرمز', 'barcode', 'code', 'sku']) ?? '';
        const barcode = String(rawBarcode || '').trim();

        const rawQty =
          findVal(['الكمية', 'العدد', 'الرصيد', 'كمية', 'عدد', 'qty', 'quantity', 'count', 'stock']) ?? 1;
        const excelQty = Math.max(0, parseNumber(rawQty, 1));

        const rawBuy =
          findVal(['سعر الشراء', 'شراء', 'التكلفة', 'سعر التكلفة', 'الجملة', 'سعر الجملة', 'buy_price', 'buy', 'cost']) ?? 0;
        const excelBuyPrice = Math.max(0, parseNumber(rawBuy, 0));

        const rawSell =
          findVal(['سعر البيع', 'بيع', 'المفرد', 'سعر المفرد', 'السعر', 'sell_price', 'sell', 'price']) ??
          excelBuyPrice;
        const excelSellPrice = Math.max(0, parseNumber(rawSell, excelBuyPrice));

        // Match with existing warehouse product by barcode or name
        const matched =
          (barcode
            ? existingProducts.find((p) => p.barcode && p.barcode.trim() === barcode)
            : null) ||
          existingProducts.find((p) => p.name.trim().toLowerCase() === name.toLowerCase()) ||
          null;

        const oldSellPrice = matched ? matched.sell_price : null;
        const oldBuyPrice = matched ? matched.buy_price : null;
        const oldQty = matched ? matched.qty : null;

        // Default to 'new' price if Excel has a positive sell price, otherwise fallback to 'old' if available
        const hasNewSell = excelSellPrice > 0;
        const defaultChoice: 'new' | 'old' =
          hasNewSell ? 'new' : oldSellPrice !== null ? 'old' : 'new';
        const finalSellPrice =
          defaultChoice === 'old' && oldSellPrice !== null
            ? oldSellPrice
            : excelSellPrice > 0
            ? excelSellPrice
            : oldSellPrice ?? excelBuyPrice;

        parsedRows.push({
          id: `excel_row_${idx}_${Date.now()}`,
          selected: true,
          name,
          category: category || matched?.category || 'عام',
          barcode: barcode || matched?.barcode || '',
          excelQty,
          excelBuyPrice: excelBuyPrice > 0 ? excelBuyPrice : oldBuyPrice ?? 0,
          excelSellPrice: excelSellPrice > 0 ? excelSellPrice : oldSellPrice ?? 0,
          existingProduct: matched,
          oldBuyPrice,
          oldSellPrice,
          oldQty,
          priceChoice: defaultChoice,
          finalSellPrice,
          finalBuyPrice: excelBuyPrice > 0 ? excelBuyPrice : oldBuyPrice ?? 0,
        });
      });

      if (parsedRows.length === 0) {
        setErrorMsg('لم يتم العثور على أسماء منتجات صالحة في ملف الإكسل');
        return;
      }

      setRows(parsedRows);
    } catch (err) {
      console.error('Excel parse error:', err);
      setErrorMsg('تعذر قراءة ملف الإكسل، تأكد من أن الملف بصيغة .xlsx أو .xls أو .csv');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadSampleTemplate = () => {
    const sampleData = [
      {
        'اسم المنتج': 'Lcd iph 11 pro max',
        'الصنف': 'قطع غيار وصيانة',
        'الباركود': '628100701100',
        'الكمية': 5,
        'سعر الشراء': 11000,
        'سعر البيع': 16500,
      },
      {
        'اسم المنتج': 'حليب كامل الدسم 1 لتر',
        'الصنف': 'ألبان وأجبان',
        'الباركود': '628100701234',
        'الكمية': 12,
        'سعر الشراء': 5,
        'سعر البيع': 7.5,
      },
      {
        'اسم المنتج': 'شاحن سريع أصلي 20W',
        'الصنف': 'إلكترونيات',
        'الباركود': '628100709999',
        'الكمية': 10,
        'سعر الشراء': 8000,
        'سعر البيع': 12000,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المنتجات');
    XLSX.writeFile(wb, 'نموذج_استيراد_المنتجات_Cashier.xlsx');
  };

  const applyPriceChoiceToRow = (rowId: string, choice: 'new' | 'old') => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (choice === 'old' && r.oldSellPrice !== null) {
          return {
            ...r,
            priceChoice: 'old',
            finalSellPrice: r.oldSellPrice,
          };
        }
        return {
          ...r,
          priceChoice: 'new',
          finalSellPrice: r.excelSellPrice,
        };
      })
    );
  };

  const applyBulkPriceChoice = (choice: 'new' | 'old') => {
    setRows((prev) =>
      prev.map((r) => {
        if (choice === 'old' && r.oldSellPrice !== null) {
          return {
            ...r,
            priceChoice: 'old',
            finalSellPrice: r.oldSellPrice,
          };
        }
        return {
          ...r,
          priceChoice: 'new',
          finalSellPrice: r.excelSellPrice,
        };
      })
    );
  };

  const updateRowField = (rowId: string, updates: Partial<ExcelPreviewRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...updates } : r)));
  };

  const handleConfirmImport = async () => {
    if (isImporting) return;
    const selectedRows = rows.filter((r) => r.selected && r.name.trim() !== '');
    if (selectedRows.length === 0) {
      setErrorMsg('يرجى تحديد منتج واحد على الأقل للاستيراد');
      return;
    }

    try {
      setIsImporting(true);
      const importedResults: ImportedExcelProductResult[] = [];

      for (const r of selectedRows) {
        const cleanCat = r.category.trim() || 'عام';
        await DB.addCategory(cleanCat);

        const newQtyValue =
          r.existingProduct && qtyMode === 'add'
            ? (r.existingProduct.qty || 0) + r.excelQty
            : r.excelQty;

        const saved = await DB.saveProduct({
          id: r.existingProduct?.id,
          name: r.name.trim(),
          category: cleanCat,
          barcode: r.barcode.trim() || r.existingProduct?.barcode || '',
          buy_price: r.finalBuyPrice,
          sell_price: r.finalSellPrice,
          qty: newQtyValue,
          image: r.existingProduct?.image,
        });

        importedResults.push({
          product: saved,
          importedQty: r.excelQty,
          importedBuyPrice: r.finalBuyPrice,
          chosenSellPrice: r.finalSellPrice,
        });
      }

      playSuccessChime();
      onImportComplete?.(importedResults);
      setRows([]);
      setFileName('');
      onClose();
    } catch (err) {
      console.error('Failed to import excel items:', err);
      setErrorMsg('حدث خطأ أثناء حفظ المنتجات المستوردة');
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = rows.filter((r) => r.selected).length;
  const existingMatchCount = rows.filter((r) => r.existingProduct !== null).length;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2.5 sm:p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1e4663] text-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black truncate">
                استيراد المنتجات من إكسل وتسعير البيع
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-200 truncate">
                اختر السعر الجديد أو القديم لكل منتج قبل إضافته للمخزن
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/80 hover:bg-white/10 hover:text-white transition shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
          {/* File Upload & Template Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl bg-[#0d9488] hover:bg-teal-700 text-white px-3.5 py-2 text-xs sm:text-sm font-extrabold shadow-xs transition cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                <span>{rows.length > 0 ? 'اختيار ملف إكسل آخر' : 'اختر ملف إكسل (.xlsx / .csv)'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSampleTemplate}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 text-xs font-bold transition cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-[#1e4663]" />
                <span>تحميل نموذج إكسل جاهز</span>
              </button>
            </div>

            {fileName && (
              <span className="text-[11px] font-bold text-slate-600 truncate max-w-[200px]">
                الملف: {fileName}
              </span>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-red-500 font-bold px-1">
                ✕
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-3 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-teal-600/70 stroke-1" />
              <div className="space-y-1">
                <p className="text-sm font-extrabold text-slate-800">
                  ارفع ملف الإكسل لعرض المنتجات ومقارنة الأسعار قبل الحفظ
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  يدعم الأعمدة: <strong>اسم المنتج</strong>، <strong>الصنف</strong>، <strong>الباركود</strong>، <strong>الكمية</strong>، <strong>سعر الشراء</strong>، و<strong>سعر البيع</strong>. سيظهر لك كل منتج لاختيار بيعه بالسعر الجديد أو السعر القديم.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1e4663] hover:bg-[#16354b] text-white px-5 py-2.5 text-xs sm:text-sm font-extrabold shadow-sm transition cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                <span>اختيار ملف إكسل من الجهاز</span>
              </button>
            </div>
          ) : (
            <>
              {/* Global Pricing & Stock Mode Controls */}
              <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <ArrowLeftRight className="h-4 w-4 text-teal-700" />
                    <span>
                      معاينة وتسعير المنتجات ({rows.length} منتج • {existingMatchCount} موجود سابقاً بالمخزن)
                    </span>
                  </div>

                  {/* Quick Bulk Price Switcher */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyBulkPriceChoice('new')}
                      className="px-2.5 py-1 rounded-lg bg-[#0d9488] hover:bg-teal-700 text-white text-[11px] font-extrabold transition cursor-pointer"
                    >
                      السعر الجديد للكل
                    </button>
                    {existingMatchCount > 0 && (
                      <button
                        type="button"
                        onClick={() => applyBulkPriceChoice('old')}
                        className="px-2.5 py-1 rounded-lg bg-[#1e4663] hover:bg-[#16354b] text-white text-[11px] font-extrabold transition cursor-pointer"
                      >
                        السعر القديم للكل
                      </button>
                    )}
                  </div>
                </div>

                {/* Quantity Mode Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-teal-200/60 text-xs">
                  <span className="font-bold text-slate-700">طريقة التعامل مع كمية المنتجات الموجودة:</span>
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setQtyMode('add')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                        qtyMode === 'add'
                          ? 'bg-[#1e4663] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      إضافة فوق الرصيد الحالي
                    </button>
                    <button
                      type="button"
                      onClick={() => setQtyMode('replace')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition cursor-pointer ${
                        qtyMode === 'replace'
                          ? 'bg-[#1e4663] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      استبدال الرصيد بالكمية الجديدة
                    </button>
                  </div>
                </div>
              </div>

              {/* Product Cards List for Individual Price Selection */}
              <div className="space-y-2.5">
                {rows.map((row, idx) => {
                  const hasOld = row.oldSellPrice !== null;
                  const priceDiff =
                    hasOld && row.oldSellPrice !== null
                      ? row.excelSellPrice - row.oldSellPrice
                      : 0;

                  return (
                    <div
                      key={row.id}
                      className={`rounded-2xl border p-3 transition ${
                        row.selected
                          ? 'bg-white border-slate-200 shadow-2xs'
                          : 'bg-slate-50/60 border-slate-200/60 opacity-60'
                      }`}
                    >
                      {/* Top Row: Checkbox + Name + Existing Status + Category */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => updateRowField(row.id, { selected: !row.selected })}
                            className="text-[#1e4663] hover:opacity-80 shrink-0 cursor-pointer"
                          >
                            {row.selected ? (
                              <CheckSquare className="h-5 w-5 text-[#0d9488]" />
                            ) : (
                              <Square className="h-5 w-5 text-slate-400" />
                            )}
                          </button>

                          <span className="text-xs font-mono font-bold text-slate-400 shrink-0">
                            #{idx + 1}
                          </span>

                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => updateRowField(row.id, { name: e.target.value })}
                            className="font-extrabold text-slate-900 text-xs sm:text-sm bg-transparent border-b border-transparent focus:border-[#1e4663] focus:outline-hidden min-w-0 flex-1"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasOld ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                              موجود بالمخزن (رصيد: {row.oldQty})
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                              منتج جديد
                            </span>
                          )}

                          <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-0.5">
                            <Tag className="h-3 w-3 text-slate-500" />
                            <input
                              type="text"
                              list={`cats_${row.id}`}
                              value={row.category}
                              onChange={(e) => updateRowField(row.id, { category: e.target.value })}
                              className="text-[11px] font-bold text-slate-700 bg-transparent w-20 sm:w-24 focus:outline-hidden"
                              placeholder="الصنف"
                            />
                            <datalist id={`cats_${row.id}`}>
                              {categories.map((c) => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                          </div>
                        </div>
                      </div>

                      {/* Middle Row: Old vs New Selling Price Choice Buttons */}
                      <div className="pt-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        {/* Left/Right Choice Buttons: New Price vs Old Price */}
                        <div className="sm:col-span-7 grid grid-cols-2 gap-2">
                          {/* Option 1: New Sell Price from Excel */}
                          <button
                            type="button"
                            onClick={() => applyPriceChoiceToRow(row.id, 'new')}
                            className={`p-2 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                              row.priceChoice === 'new'
                                ? 'border-[#0d9488] bg-teal-50/80 ring-1 ring-[#0d9488]'
                                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-[10px] font-extrabold text-teal-800">
                                السعر الجديد (إكسل)
                              </span>
                              {row.priceChoice === 'new' && (
                                <Check className="h-3.5 w-3.5 text-[#0d9488]" />
                              )}
                            </div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="font-mono font-black text-sm sm:text-base text-[#0d9488]">
                                {row.excelSellPrice.toFixed(0)} {currency}
                              </span>
                              {hasOld && priceDiff !== 0 && (
                                <span
                                  className={`text-[10px] font-mono font-bold ${
                                    priceDiff > 0 ? 'text-amber-700' : 'text-blue-700'
                                  }`}
                                >
                                  {priceDiff > 0 ? `+${priceDiff.toFixed(0)}` : priceDiff.toFixed(0)}
                                </span>
                              )}
                            </div>
                          </button>

                          {/* Option 2: Old Sell Price from Warehouse */}
                          <button
                            type="button"
                            disabled={!hasOld}
                            onClick={() => hasOld && applyPriceChoiceToRow(row.id, 'old')}
                            className={`p-2 rounded-xl border text-right transition flex flex-col justify-between ${
                              !hasOld
                                ? 'border-slate-200/60 bg-slate-100/50 opacity-50 cursor-not-allowed'
                                : row.priceChoice === 'old'
                                ? 'border-[#1e4663] bg-blue-50/70 ring-1 ring-[#1e4663] cursor-pointer'
                                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-[10px] font-extrabold text-slate-700">
                                السعر القديم (بالمخزن)
                              </span>
                              {row.priceChoice === 'old' && (
                                <Check className="h-3.5 w-3.5 text-[#1e4663]" />
                              )}
                            </div>
                            <div className="mt-1">
                              {hasOld && row.oldSellPrice !== null ? (
                                <span className="font-mono font-black text-sm sm:text-base text-[#1e4663]">
                                  {row.oldSellPrice.toFixed(0)} {currency}
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-slate-400">
                                  لا يوجد سعر قديم
                                </span>
                              )}
                            </div>
                          </button>
                        </div>

                        {/* Editable Final Sell Price, Buy Price & Qty */}
                        <div className="sm:col-span-5 grid grid-cols-3 gap-1.5">
                          <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                            <label className="block text-[9px] font-bold text-slate-500">
                              الكمية المضافة
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={row.excelQty}
                              onChange={(e) =>
                                updateRowField(row.id, {
                                  excelQty: Math.max(0, parseFloat(e.target.value) || 0),
                                })
                              }
                              className="w-full font-mono font-black text-xs text-slate-800 bg-transparent focus:outline-hidden text-center mt-0.5"
                            />
                          </div>

                          <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                            <label className="block text-[9px] font-bold text-slate-500">
                              سعر الشراء
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={row.finalBuyPrice}
                              onChange={(e) =>
                                updateRowField(row.id, {
                                  finalBuyPrice: Math.max(0, parseFloat(e.target.value) || 0),
                                })
                              }
                              className="w-full font-mono font-bold text-xs text-slate-700 bg-transparent focus:outline-hidden text-center mt-0.5"
                            />
                          </div>

                          <div className="bg-teal-50/50 p-1.5 rounded-xl border border-teal-300">
                            <label className="block text-[9px] font-extrabold text-teal-800">
                              سعر البيع المعتمد
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={row.finalSellPrice}
                              onChange={(e) =>
                                updateRowField(row.id, {
                                  priceChoice: 'custom',
                                  finalSellPrice: Math.max(0, parseFloat(e.target.value) || 0),
                                })
                              }
                              className="w-full font-mono font-black text-xs text-[#0d9488] bg-transparent focus:outline-hidden text-center mt-0.5"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-extrabold text-slate-700 transition cursor-pointer"
          >
            إلغاء
          </button>

          {rows.length > 0 && (
            <button
              type="button"
              disabled={isImporting}
              onClick={handleConfirmImport}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-[#1e4663] hover:bg-[#16354b] text-white px-5 py-2.5 text-xs sm:text-sm font-extrabold shadow-md transition active:scale-98 cursor-pointer disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span>
                {isImporting
                  ? 'جاري حفظ المنتجات...'
                  : mode === 'purchase_invoice'
                  ? `اعتماد وإضافة (${selectedCount}) منتج للفاتورة والمخزن`
                  : `اعتماد وحفظ (${selectedCount}) منتج بالأسعار المختارة`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
