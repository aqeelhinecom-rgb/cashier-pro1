import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Check,
  UserPlus,
  Minus,
  Edit2,
  ChevronDown,
  ShoppingBag,
  PackagePlus,
  Image as ImageIcon,
  X,
  Tag,
  MoreVertical,
  Search,
  FileSpreadsheet,
} from 'lucide-react';
import { DB } from '../services/db';
import { Invoice, InvoiceItem, InvoiceType, Party, Product, ScreenId } from '../types';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { ExcelImportModal, ImportedExcelProductResult } from '../components/ExcelImportModal';
import { ReceiptModal } from '../components/ReceiptModal';
import { playScannerBeep, playSuccessChime } from '../services/audio';
import { compressImageFile } from '../utils/image';
import { useBackHandler } from '../services/navigation';
import { generateUUID } from '../services/storage/uuid';

interface InvoiceScreenProps {
  type: InvoiceType;
  onBack: () => void;
  onNavigate?: (screen: ScreenId) => void;
}

export const InvoiceScreen: React.FC<InvoiceScreenProps> = ({ type, onNavigate }) => {
  const isSale = type === 'sale' || type === 'sale_return' || type === 'quote';
  const settings = DB.getSettings();
  const [productsFontSize, setProductsFontSize] = useState<number>(
    settings.productsFontSize || 15
  );

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [discount, setDiscount] = useState<number>(0);
  const [paid, setPaid] = useState<string>('');
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>(settings.currency || 'د.ع');

  // Search / Add bar state matching screenshot
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState<boolean>(false);
  const [bottomOptionsOpen, setBottomOptionsOpen] = useState<boolean>(false);

  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [pickModalOpen, setPickModalOpen] = useState<boolean>(false);
  const [newPartyModalOpen, setNewPartyModalOpen] = useState<boolean>(false);
  const [newPartyName, setNewPartyName] = useState<string>('');
  const [newPartyPhone, setNewPartyPhone] = useState<string>('');

  // New Product / Type Modal state (for Purchases)
  const [newProductModalOpen, setNewProductModalOpen] = useState<boolean>(false);
  const [excelImportOpen, setExcelImportOpen] = useState<boolean>(false);
  const [newProdCategory, setNewProdCategory] = useState<string>('عام');
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [isWritingCustomCategory, setIsWritingCustomCategory] = useState<boolean>(false);
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdQty, setNewProdQty] = useState<string>('1');
  const [newProdBuyPrice, setNewProdBuyPrice] = useState<string>('');
  const [newProdSellPrice, setNewProdSellPrice] = useState<string>('');
  const [newProdBarcode, setNewProdBarcode] = useState<string>('');
  const [newProdImage, setNewProdImage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const saveLockRef = useRef<boolean>(false);
  const draftIdempotencyKeyRef = useRef<string | null>(null);

  // Editing single item modal state
  const [editingItem, setEditingItem] = useState<{
    index: number;
    name: string;
    category: string;
    isCustomCategory?: boolean;
    qty: number;
    price: number;
    sell_price?: number;
  } | null>(null);

  // Saved receipt modal state
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const [savedItems, setSavedItems] = useState<InvoiceItem[]>([]);
  const [receiptOpen, setReceiptOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parked / Held invoices state for busy cashiers
  const [heldInvoices, setHeldInvoices] = useState<
    {
      id: string;
      time: string;
      partyId: number | null;
      partyName: string;
      items: InvoiceItem[];
      discount: number;
    }[]
  >(() => {
    try {
      return DB.getHeldInvoices(`cashier_held_${type}`);
    } catch {
      return [];
    }
  });

  const saveHeldInvoicesList = (
    list: {
      id: string;
      time: string;
      partyId: number | null;
      partyName: string;
      items: InvoiceItem[];
      discount: number;
    }[]
  ) => {
    setHeldInvoices(list);
    DB.saveHeldInvoices(`cashier_held_${type}`, list);
  };

  const handleHoldCurrentInvoice = () => {
    if (items.length === 0) return;
    const chosenParty = parties.find((p) => p.id === selectedPartyId);
    const newHeld = {
      id: `hold_${Date.now()}`,
      time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      partyId: selectedPartyId,
      partyName: chosenParty?.name || (isSale ? 'عميل نقدي' : 'مورد نقدي'),
      items: [...items],
      discount,
    };
    saveHeldInvoicesList([newHeld, ...heldInvoices]);
    setItems([]);
    setDiscount(0);
    setPaid('');
    setSelectedPartyId(null);
  };

  const handleRestoreHeldInvoice = (holdId: string) => {
    const found = heldInvoices.find((h) => h.id === holdId);
    if (!found) return;
    setItems(found.items);
    setSelectedPartyId(found.partyId);
    setDiscount(found.discount);
    setPaid('');
    saveHeldInvoicesList(heldInvoices.filter((h) => h.id !== holdId));
  };

  // Step-by-step phone Back button handlers
  useBackHandler(scannerOpen, () => setScannerOpen(false));
  useBackHandler(pickModalOpen, () => setPickModalOpen(false));
  useBackHandler(newPartyModalOpen, () => setNewPartyModalOpen(false));
  useBackHandler(newProductModalOpen, () => setNewProductModalOpen(false));
  useBackHandler(editingItem !== null, () => setEditingItem(null));
  useBackHandler(receiptOpen, () => setReceiptOpen(false));
  useBackHandler(optionsMenuOpen, () => setOptionsMenuOpen(false));
  useBackHandler(bottomOptionsOpen, () => setBottomOptionsOpen(false));

  const loadParties = () => {
    setParties(DB.getParties(isSale ? 'customer' : 'supplier'));
    setCategories(DB.getCategories());
    const s = DB.getSettings();
    setInvoiceCurrency(s.currency || 'د.ع');
    setProductsFontSize(s.productsFontSize || 15);
  };

  useEffect(() => {
    loadParties();
    return DB.subscribe(loadParties);
  }, [type]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    setSuggestions(DB.getProducts(q).slice(0, 8));
  }, [searchQuery]);

  useEffect(() => {
    draftIdempotencyKeyRef.current = null;
  }, [items, discount, paid, selectedPartyId, type]);

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  const paidNumber = paid === '' ? total : Number(paid) || 0;
  const remaining = Math.max(0, total - paidNumber);

  const addProductToInvoice = (product: Product) => {
    const existingIndex = items.findIndex((i) => i.product_id === product.id);
    const currentCartQty = items
      .filter((i) => i.product_id === product.id)
      .reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
    const nextQty = currentCartQty + 1;

    if (type === 'sale') {
      const available = Number(product.qty) || 0;
      if (available <= 0 || nextQty > available) {
        setErrorMessage(
          `لا يمكن بيع "${product.name}" — الكمية المطلوبة (${nextQty}) تتجاوز الرصيد المتاح في المخزن (${available}).`
        );
        playScannerBeep(false);
        return;
      }
    }

    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex] = {
        ...updated[existingIndex],
        qty: updated[existingIndex].qty + 1,
      };
      setItems(updated);
    } else {
      const newItem: InvoiceItem = {
        product_id: product.id,
        name: product.name,
        category: product.category,
        qty: 1,
        price: isSale ? product.sell_price : product.buy_price,
        cost: product.buy_price,
        sell_price: product.sell_price,
        image: product.image,
      };
      setItems([...items, newItem]);
    }
    playScannerBeep(true);
    setSearchQuery('');
    setShowSuggestions(false);
    setErrorMessage(null);
  };

  const handleAddButtonClick = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();

    if (q) {
      // Check exact barcode match first
      const byBarcode = DB.getProductByBarcode(q);
      if (byBarcode) {
        addProductToInvoice(byBarcode);
        return;
      }

      // Check exact name match
      const matches = DB.getProducts(q);
      const exactMatch = matches.find((p) => p.name.toLowerCase() === q.toLowerCase());
      if (exactMatch) {
        addProductToInvoice(exactMatch);
        return;
      }

      // If in Purchases and typed a new name -> open New Product modal with name pre-filled
      if (!isSale) {
        setNewProdName(q);
        setNewProductModalOpen(true);
        setShowSuggestions(false);
        return;
      }

      // If in Sales and there is a partial match -> add first match
      if (matches.length > 0) {
        addProductToInvoice(matches[0]);
        return;
      }

      setErrorMessage(`لم يتم العثور على "${q}" في المخزن`);
      playScannerBeep(false);
      return;
    }

    // When input is empty and user clicks "اضف":
    if (!isSale) {
      // In Purchases: open modal to write a new product/type or pick from warehouse
      setNewProdName('');
      setNewProductModalOpen(true);
    } else {
      // In Sales: open product picker modal
      setPickModalOpen(true);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setNewProdImage(compressed);
    } catch {
      setErrorMessage('تعذر رفع الصورة، يرجى اختيار صورة صالحة');
    }
  };

  const handleCreateNewProductInPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!newProdName.trim()) {
      setErrorMessage('يرجى كتابة اسم المنتج / النوع الجديد');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalCategory = isWritingCustomCategory
        ? customCategoryInput.trim() || 'عام'
        : newProdCategory.trim() || 'عام';
      await DB.addCategory(finalCategory);
      const qtyVal = Math.max(0.01, parseFloat(newProdQty) || 1);
      const buyVal = Math.max(0, parseFloat(newProdBuyPrice) || 0);
      const sellVal = Math.max(0, parseFloat(newProdSellPrice) || buyVal);

      const createdProduct = await DB.saveProduct({
        name: newProdName.trim(),
        category: finalCategory,
        barcode: newProdBarcode.trim() || undefined,
        buy_price: buyVal,
        sell_price: sellVal,
        qty: isSale ? 0 : qtyVal,
        currency: invoiceCurrency,
        image: newProdImage || undefined,
      });

      const newItem: InvoiceItem = {
        product_id: createdProduct.id,
        name: createdProduct.name,
        category: createdProduct.category,
        qty: qtyVal,
        price: isSale ? sellVal : buyVal,
        cost: buyVal,
        sell_price: sellVal,
        image: createdProduct.image,
        stockAlreadyAdded: !isSale,
        initialAddedQty: !isSale ? qtyVal : 0,
      };

      setItems((prev) => [...prev, newItem]);
      playSuccessChime();

      setNewProdName('');
      setNewProdQty('1');
      setNewProdBuyPrice('');
      setNewProdSellPrice('');
      setNewProdBarcode('');
      setNewProdImage('');
      setCustomCategoryInput('');
      setIsWritingCustomCategory(false);
      setNewProductModalOpen(false);
      setSearchQuery('');
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء إضافة الصنف الجديد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScannerDetected = (code: string) => {
    const prod = DB.getProductByBarcode(code);
    if (prod) {
      addProductToInvoice(prod);
    } else if (!isSale) {
      // In purchases, allow creating a new product with this scanned barcode
      setNewProdBarcode(code);
      setNewProductModalOpen(true);
    } else {
      setErrorMessage(`لا يوجد منتج مسجل بالباركود: ${code}`);
      playScannerBeep(false);
    }
  };

  const updateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeItem(index);
      return;
    }
    const roundedQty = Math.round(newQty * 100) / 100;
    const targetItem = items[index];
    if (type === 'sale' && targetItem) {
      const prod = DB.getProductById(targetItem.product_id);
      const otherQty = items
        .filter((_, idx) => idx !== index && items[idx].product_id === targetItem.product_id)
        .reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
      const available = Number(prod?.qty) || 0;
      if (otherQty + roundedQty > available) {
        setErrorMessage(
          `الكمية المطلوبة من "${targetItem.name}" (${otherQty + roundedQty}) تتجاوز الرصيد المتاح (${available}).`
        );
        playScannerBeep(false);
        return;
      }
    }
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      qty: roundedQty,
    };
    setItems(updated);
    setErrorMessage(null);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSaveItemEdit = async () => {
    if (!editingItem || isSubmitting) return;
    const desiredQty = Math.max(0.01, Number(editingItem.qty) || 1);
    const targetItem = items[editingItem.index];
    if (type === 'sale' && targetItem) {
      const existingProd = DB.getProductById(targetItem.product_id);
      const otherQty = items
        .filter((_, idx) => idx !== editingItem.index && items[idx].product_id === targetItem.product_id)
        .reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
      const available = Number(existingProd?.qty) || 0;
      if (otherQty + desiredQty > available) {
        setErrorMessage(
          `الكمية المطلوبة من "${editingItem.name}" (${otherQty + desiredQty}) تتجاوز الرصيد المتاح (${available}).`
        );
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const updated = [...items];
      const finalName = editingItem.name.trim() || targetItem.name;
      const finalCategory = editingItem.category.trim() || targetItem.category || 'عام';
      await DB.addCategory(finalCategory);

      updated[editingItem.index] = {
        ...targetItem,
        name: finalName,
        category: finalCategory,
        qty: desiredQty,
        price: Math.max(0, Number(editingItem.price) || 0),
        sell_price:
          editingItem.sell_price !== undefined
            ? Math.max(0, Number(editingItem.sell_price) || 0)
            : targetItem.sell_price,
      };

      // Also update the product's name and category in the warehouse if it exists
      const existingProd = DB.getProducts().find((p) => p.id === targetItem.product_id);
      if (existingProd) {
        await DB.saveProduct({
          ...existingProd,
          name: finalName,
          category: finalCategory,
          sell_price: isSale
            ? Math.max(0, Number(editingItem.price) || existingProd.sell_price)
            : editingItem.sell_price !== undefined
            ? Math.max(0, Number(editingItem.sell_price) || existingProd.sell_price)
            : existingProd.sell_price,
        });
      }

      setItems(updated);
      setEditingItem(null);
      setErrorMessage(null);
      playSuccessChime();
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء تعديل بيانات البند');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartyName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const created = await DB.addParty(
        newPartyName.trim(),
        newPartyPhone.trim(),
        isSale ? 'customer' : 'supplier'
      );
      setSelectedPartyId(created.id);
      setNewPartyName('');
      setNewPartyPhone('');
      setNewPartyModalOpen(false);
      playSuccessChime();
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء إضافة الطرف الجديد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (saveLockRef.current || isSubmitting) return;

    if (items.length === 0) {
      setErrorMessage('الرجاء إضافة منتج واحد على الأقل للفاتورة');
      return;
    }

    if (type === 'sale') {
      const requestedMap = new Map<number, { qty: number; name: string }>();
      for (const item of items) {
        const prev = requestedMap.get(item.product_id);
        const q = Number(item.qty) || 0;
        if (prev) {
          prev.qty += q;
        } else {
          requestedMap.set(item.product_id, { qty: q, name: item.name });
        }
      }
      for (const [productId, req] of requestedMap.entries()) {
        const prod = DB.getProductById(productId);
        const available = Number(prod?.qty) || 0;
        if (!prod || req.qty > available) {
          setErrorMessage(
            `الكمية المطلوبة من "${req.name}" (${req.qty}) تتجاوز الرصيد المتاح في المخزن (${available}).`
          );
          playScannerBeep(false);
          return;
        }
      }
    }

    if (paidNumber < total && !selectedPartyId) {
      setErrorMessage(
        isSale
          ? 'اختر العميل لتسجيل المبلغ المتبقي عليه كدين'
          : 'اختر المورد لتسجيل المبلغ المتبقي له كمستحق'
      );
      return;
    }

    saveLockRef.current = true;
    setIsSubmitting(true);
    const idempotencyKey = draftIdempotencyKeyRef.current || generateUUID();
    draftIdempotencyKeyRef.current = idempotencyKey;

    try {
      const invoice = await DB.saveInvoice({
        type,
        partyId: selectedPartyId,
        items,
        discount: Number(discount) || 0,
        paid: paidNumber,
        currency: invoiceCurrency,
        idempotencyKey,
      });

      draftIdempotencyKeyRef.current = null;
      playSuccessChime();
      setSavedInvoice(invoice);
      setSavedItems([...items]);
      setReceiptOpen(true);

      setItems([]);
      setDiscount(0);
      setPaid('');
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء حفظ الفاتورة');
    } finally {
      saveLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="relative min-h-[calc(100dvh-75px)] flex flex-col justify-between pb-16">
      {/* Top Minimal Section Matching Screenshots */}
      <div className="space-y-2.5">
        {/* Row 1: Right "اضف منتج" | Left "استخدم الباركود" + Options ⋮ */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-sm font-bold text-slate-800">اضف منتج</span>

          <div className="flex items-center gap-2 sm:gap-3">
            {!isSale && (
              <button
                type="button"
                onClick={() => setExcelImportOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-emerald-600/30 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800 transition cursor-pointer"
                title="استيراد منتجات من إكسل وتسعير البيع"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                <span>من إكسل</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="text-xs sm:text-sm font-bold text-[#1e4663] underline underline-offset-4 hover:opacity-80 transition cursor-pointer"
            >
              استخدم الباركود
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setOptionsMenuOpen(!optionsMenuOpen)}
                className="p-1 rounded-lg text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
                title="خيارات"
              >
                <MoreVertical className="h-5 w-5" />
              </button>

              {optionsMenuOpen && (
                <>
                  <div
                    onClick={() => setOptionsMenuOpen(false)}
                    className="fixed inset-0 z-30"
                  />
                  {isSale ? (
                    /* Top-left compact card menu matching Screenshot 5 */
                    <div className="absolute left-0 mt-1 w-64 rounded-2xl bg-white border border-slate-200/90 shadow-2xl p-3 z-40 space-y-2.5">
                      {/* Row 1: فواتير البيع | 🔍 */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm sm:text-base font-bold text-slate-800">
                          فواتير البيع
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setOptionsMenuOpen(false);
                              onNavigate?.('invoices_sale');
                            }}
                            className="h-9 w-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            title="بحث في فواتير البيع"
                          >
                            <Search className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: فواتير المرتجع | 🔍 | + */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm sm:text-base font-bold text-slate-800">
                          فواتير المرتجع
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setOptionsMenuOpen(false);
                              onNavigate?.('invoices_return');
                            }}
                            className="h-9 w-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            title="بحث في فواتير المرتجع"
                          >
                            <Search className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOptionsMenuOpen(false);
                              onNavigate?.('sale_return');
                            }}
                            className="h-9 w-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            title="إضافة فاتورة مرتجع"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Row 3: عروض الاسعار | 🔍 | + */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm sm:text-base font-bold text-slate-800">
                          عروض الاسعار
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setOptionsMenuOpen(false);
                              onNavigate?.('invoices_quote');
                            }}
                            className="h-9 w-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            title="بحث في عروض الأسعار"
                          >
                            <Search className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOptionsMenuOpen(false);
                              onNavigate?.('quote');
                            }}
                            className="h-9 w-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            title="إضافة عرض سعر"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Purchase options menu */
                    <div className="absolute left-0 mt-1 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl py-1.5 z-40 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setOptionsMenuOpen(false);
                          onNavigate?.('invoices_purchase');
                        }}
                        className="w-full text-right px-4 py-2.5 text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                      >
                        <span>فواتير الشراء</span>
                        <Search className="h-4 w-4 text-slate-500" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOptionsMenuOpen(false);
                          setPickModalOpen(true);
                        }}
                        className="w-full text-right px-4 py-2.5 text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                      >
                        <ShoppingBag className="h-4 w-4 text-teal-600" />
                        <span>اختيار من مخزن المنتجات</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOptionsMenuOpen(false);
                          setNewProductModalOpen(true);
                        }}
                        className="w-full text-right px-4 py-2.5 text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                      >
                        <PackagePlus className="h-4 w-4 text-amber-600" />
                        <span>كتابة نوع / منتج جديد</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOptionsMenuOpen(false);
                          setExcelImportOpen(true);
                        }}
                        className="w-full text-right px-4 py-2.5 text-emerald-800 hover:bg-emerald-50 flex items-center gap-2"
                      >
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        <span>استيراد منتجات من ملف إكسل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOptionsMenuOpen(false);
                          setNewPartyModalOpen(true);
                        }}
                        className="w-full text-right px-4 py-2.5 text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                      >
                        <UserPlus className="h-4 w-4 text-purple-600" />
                        <span>إضافة مورد جديد</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Unified Bar -> Right button "اضف" (#1e4663) + Left input */}
        <div className="relative">
          <form
            onSubmit={handleAddButtonClick}
            className="flex items-stretch rounded-xl sm:rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 bg-[#f0f0f0]"
          >
            <button
              type="submit"
              className="bg-[#1e4663] hover:bg-[#16354b] text-white font-bold px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base transition shrink-0 cursor-pointer active:scale-98"
            >
              اضف
            </button>

            <input
              type="text"
              value={searchQuery}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              placeholder={isSale ? 'ادخل اسم منتج بالفاتورة' : 'ادخل اسم منتج او صنف بالفاتورة'}
              className="w-full bg-[#f0f0f0] px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base text-slate-800 placeholder:text-slate-500 focus:outline-hidden text-right"
            />
          </form>

          {/* Instant Autocomplete Dropdown when typing */}
          {showSuggestions && searchQuery.trim() !== '' && (
            <div className="absolute inset-x-0 top-full mt-1.5 z-30 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProductToInvoice(p)}
                  style={{ fontSize: `${productsFontSize}px` }}
                  className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-2.5">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className="h-9 w-9 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : null}
                    <div>
                      <span className="font-bold text-slate-900 block">{p.name}</span>
                      <span className="text-xs text-slate-400">
                        {p.category || 'عام'} • المخزن: {p.qty}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-teal-700 text-sm">
                    {(isSale ? p.sell_price : p.buy_price).toFixed(0)} {invoiceCurrency}
                  </span>
                </button>
              ))}

              {!isSale && (
                <button
                  type="button"
                  onClick={() => {
                    setNewProdName(searchQuery.trim());
                    setShowSuggestions(false);
                    setNewProductModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-amber-50/70 hover:bg-amber-100/70 text-amber-800 text-xs font-extrabold transition"
                >
                  <span className="flex items-center gap-1.5">
                    <PackagePlus className="h-4 w-4" />
                    كتابة نوع جديد باسم: &quot;{searchQuery.trim()}&quot;
                  </span>
                  <span>+ إضافة للمخزن</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error alert if any */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-800 font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Held / Parked Invoices Strip (Shown when there are parked invoices) */}
        {heldInvoices.length > 0 && (
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-2.5 space-y-1.5">
            <div className="text-[11px] font-extrabold text-amber-900">
              فواتير معلقة مؤقتاً ({heldInvoices.length}) — اضغط لاسترجاع الفاتورة:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {heldInvoices.map((h) => (
                <div
                  key={h.id}
                  className="inline-flex items-center gap-1.5 bg-white border border-amber-300 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs"
                >
                  <button
                    type="button"
                    onClick={() => handleRestoreHeldInvoice(h.id)}
                    className="hover:text-[#1e4663] cursor-pointer"
                  >
                    <span>{h.partyName}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="text-[#0d9488] font-mono">{h.items.length} أصناف</span>
                    <span className="text-slate-400 mr-1 text-[10px]">({h.time})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveHeldInvoicesList(heldInvoices.filter((item) => item.id !== h.id))
                    }
                    className="text-slate-400 hover:text-red-600 px-1"
                    title="إلغاء الفاتورة المعلقة"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Added Invoice Items List (Only shown when items > 0, keeping empty state clean like screenshot) */}
        {items.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden mt-3">
            <div className="border-b border-slate-100 px-4 py-2.5 flex items-center justify-between bg-slate-50">
              <span className="font-bold text-slate-700 text-xs">
                الأصناف المضافة ({items.length})
              </span>
              <button
                type="button"
                onClick={() => setItems([])}
                className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" /> تفريغ
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] sm:text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-2 sm:px-3 py-2">المنتج</th>
                    <th className="px-1.5 sm:px-3 py-2 text-center">العدد</th>
                    <th className="px-1.5 sm:px-3 py-2 text-center">السعر</th>
                    <th className="px-2 sm:px-3 py-2 text-left">الإجمالي</th>
                    <th className="px-1.5 sm:px-3 py-2 text-center w-16">إجراء</th>
                  </tr>
                </thead>
                <tbody
                  style={{ fontSize: `${productsFontSize}px` }}
                  className="divide-y divide-slate-100"
                >
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition">
                      <td className="px-2 sm:px-3 py-2 font-semibold text-slate-800 max-w-[120px] sm:max-w-none">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-7 w-7 sm:h-9 sm:w-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div
                              style={{ fontSize: `${productsFontSize}px` }}
                              className="font-bold text-slate-900 truncate"
                            >
                              {item.name}
                            </div>
                            {item.category && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-teal-700 bg-teal-50 px-1 py-0.5 rounded mt-0.5">
                                <Tag className="h-2.5 w-2.5" />
                                {item.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-1 sm:px-3 py-2 text-center">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => updateItemQty(idx, item.qty - 1)}
                            className="p-0.5 sm:p-1 text-slate-500 hover:bg-slate-100 rounded"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            step="any"
                            value={item.qty}
                            onChange={(e) => updateItemQty(idx, parseFloat(e.target.value) || 0)}
                            className="w-8 sm:w-10 text-center text-xs font-bold font-mono focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => updateItemQty(idx, item.qty + 1)}
                            className="p-0.5 sm:p-1 text-slate-500 hover:bg-slate-100 rounded"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-1.5 sm:px-3 py-2 text-center font-mono font-bold text-slate-700 text-xs sm:text-sm">
                        {item.price.toFixed(0)}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-left font-mono font-black text-slate-900 text-xs sm:text-sm">
                        {(item.qty * item.price).toFixed(0)}
                      </td>
                      <td className="px-1.5 sm:px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingItem({
                                index: idx,
                                name: item.name,
                                category: item.category || 'عام',
                                isCustomCategory: false,
                                qty: item.qty,
                                price: item.price,
                                sell_price: item.sell_price,
                              })
                            }
                            className="p-1 text-slate-400 hover:text-teal-600 transition"
                          >
                            <Edit2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Compact Checkout Panel (Shown when items are added) */}
      {items.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-md space-y-3">
          {/* Quick 1-Tap Payment Type Selector: Cash vs Credit/Debt */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setPaid('')}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  paid === '' || Number(paid) === total
                    ? 'bg-[#0d9488] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                نقدي بالكامل
              </button>
              <button
                type="button"
                onClick={() => setPaid('0')}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  paid === '0'
                    ? 'bg-[#b91c1c] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                آجل (دين بالكامل)
              </button>
            </div>

            <button
              type="button"
              onClick={handleHoldCurrentInvoice}
              className="rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 px-3 py-1.5 text-xs font-extrabold transition cursor-pointer"
              title="تعليق الفاتورة مؤقتاً لخدمة عميل آخر"
            >
              تعليق الفاتورة مؤقتاً
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Party selector */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <select
                  value={selectedPartyId || ''}
                  onChange={(e) => setSelectedPartyId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#1e4663] focus:outline-hidden"
                >
                  <option value="">{isSale ? 'عميل نقدي' : 'مورد نقدي'}</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.balance?.toFixed(0) || 0})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
              <button
                type="button"
                onClick={() => setNewPartyModalOpen(true)}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                title={isSale ? 'عميل جديد' : 'مورد جديد'}
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>

            {/* Discount */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 shrink-0">الخصم:</span>
              <input
                type="number"
                min="0"
                step="any"
                value={discount || ''}
                onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0"
                className="w-full bg-transparent text-xs font-mono font-bold text-slate-800 focus:outline-hidden"
              />
            </div>

            {/* Paid */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 shrink-0">المدفوع:</span>
              <input
                type="number"
                min="0"
                step="any"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder={total.toFixed(0)}
                className="w-full bg-transparent text-xs font-mono font-bold text-slate-800 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3">
            <div>
              <span className="text-xs text-slate-500 block">الإجمالي المطلوب:</span>
              <span className="text-xl font-black font-mono text-[#1e4663]">
                {total.toFixed(0)} <span className="text-xs font-bold">{invoiceCurrency}</span>
              </span>
              {remaining > 0 && (
                <span className="text-xs font-bold text-[#b91c1c] mr-3">
                  (متبقي دين: {remaining.toFixed(0)})
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveInvoice}
              className="flex items-center gap-2 rounded-xl bg-[#1e4663] hover:bg-[#16354b] px-6 py-3 text-sm font-extrabold text-white shadow-md transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4" />
              <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ الفاتورة'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating ⋮ Options Button at bottom-right ONLY in Sales matching Screenshot 5 */}
      {isSale && (
        <button
          type="button"
          onClick={() => setBottomOptionsOpen(true)}
          className="fixed bottom-5 right-4 z-30 h-12 w-12 rounded-full bg-white border-2 border-[#1e4663] text-[#1e4663] hover:bg-slate-50 shadow-lg flex items-center justify-center transition active:scale-95 cursor-pointer"
          title="خيارات"
        >
          <MoreVertical className="h-5 w-5 stroke-[2.4]" />
        </button>
      )}

      {/* Bottom-Sheet "خيارات" Modal matching Screenshots 2 & 3 */}
      {bottomOptionsOpen && (
        <div
          onClick={() => setBottomOptionsOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[1px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            className="w-full max-w-2xl max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl pb-6 animate-in slide-in-from-bottom duration-200"
          >
            {/* Header "خيارات" with bottom divider line */}
            <div className="py-3.5 text-center border-b border-slate-300">
              <h3 className="text-lg font-bold text-slate-700">خيارات</h3>
            </div>

            {/* 3 Option Rows */}
            <div className="px-5 py-4 space-y-4">
              {/* Row 1: فواتير البيع | [بحث] */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold text-slate-800">فواتير البيع</span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBottomOptionsOpen(false);
                      onNavigate?.('invoices_sale');
                    }}
                    className="min-w-[100px] py-2 px-5 rounded-xl border border-[#3b5971]/70 text-slate-700 font-bold text-base hover:bg-slate-100 transition cursor-pointer"
                  >
                    بحث
                  </button>
                </div>
              </div>

              {/* Row 2: فواتير المرتجع | [بحث] [اضف] */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold text-slate-800">فواتير المرتجع</span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBottomOptionsOpen(false);
                      onNavigate?.('invoices_return');
                    }}
                    className="min-w-[100px] py-2 px-5 rounded-xl border border-[#3b5971]/70 text-slate-700 font-bold text-base hover:bg-slate-100 transition cursor-pointer"
                  >
                    بحث
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBottomOptionsOpen(false);
                      onNavigate?.('sale_return');
                    }}
                    className="min-w-[100px] py-2 px-5 rounded-xl border border-[#3b5971]/70 text-slate-700 font-bold text-base hover:bg-slate-100 transition cursor-pointer"
                  >
                    اضف
                  </button>
                </div>
              </div>

              {/* Row 3: عروض الاسعار | [بحث] [اضف] */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold text-slate-800">عروض الاسعار</span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBottomOptionsOpen(false);
                      onNavigate?.('invoices_quote');
                    }}
                    className="min-w-[100px] py-2 px-5 rounded-xl border border-[#3b5971]/70 text-slate-700 font-bold text-base hover:bg-slate-100 transition cursor-pointer"
                  >
                    بحث
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBottomOptionsOpen(false);
                      onNavigate?.('quote');
                    }}
                    className="min-w-[100px] py-2 px-5 rounded-xl border border-[#3b5971]/70 text-slate-700 font-bold text-base hover:bg-slate-100 transition cursor-pointer"
                  >
                    اضف
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Product / Type Modal (in Purchases) */}
      {newProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl my-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <PackagePlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    إضافة نوع / منتج جديد للمشتريات
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    سيتم إضافته للفاتورة الحالية وتسجيله في المخزن تلقائياً
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewProductModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewProductInPurchase} className="space-y-3.5">
              {/* 1. Category (الصنف) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">الصنف (التصنيف):</label>
                  <button
                    type="button"
                    onClick={() => setIsWritingCustomCategory(!isWritingCustomCategory)}
                    className="text-[11px] font-bold text-teal-600 hover:underline"
                  >
                    {isWritingCustomCategory ? 'اختيار من الأصناف الموجودة' : '+ كتابة صنف جديد'}
                  </button>
                </div>

                {isWritingCustomCategory ? (
                  <input
                    type="text"
                    required
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    placeholder="اكتب اسم الصنف الجديد (مثال: شاشات، إكسسوارات...)"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                ) : (
                  <div className="relative">
                    <select
                      value={newProdCategory}
                      onChange={(e) => setNewProdCategory(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                )}
              </div>

              {/* 2. Product Name (الاسم) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم المنتج / النوع الجديد:
                </label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="اكتب اسم المنتج أو النوع..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* 3. Quantity (العدد) & Optional Barcode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    العدد (الكمية):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={newProdQty}
                    onChange={(e) => setNewProdQty(e.target.value)}
                    placeholder="1"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono font-bold focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الباركود (اختياري):
                  </label>
                  <input
                    type="text"
                    value={newProdBarcode}
                    onChange={(e) => setNewProdBarcode(e.target.value)}
                    placeholder="اختياري"
                    dir="ltr"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 4. Purchase Price (سعر الشراء) & Selling Price (سعر البيع) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر الشراء ({invoiceCurrency}):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newProdBuyPrice}
                    onChange={(e) => setNewProdBuyPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono font-bold focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر البيع ({invoiceCurrency}):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newProdSellPrice}
                    onChange={(e) => setNewProdSellPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono font-bold text-emerald-700 focus:border-teal-500 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 5. Optional Product Image */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  صورة المنتج (اختياري):
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                {newProdImage ? (
                  <div className="relative flex items-center gap-3 p-2.5 rounded-2xl border border-teal-200 bg-teal-50/40">
                    <img
                      src={newProdImage}
                      alt="معاينة المنتج"
                      className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                    />
                    <div className="flex-1 text-xs">
                      <p className="font-bold text-slate-800">تم إرفاق صورة المنتج</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-teal-600 font-bold hover:underline mt-1 block"
                      >
                        تغيير الصورة
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewProdImage('')}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                      title="حذف الصورة"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 py-3.5 px-4 text-xs font-bold text-slate-600 hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/30 transition"
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span>اضغط لاختيار صورة للمنتج (اختياري)</span>
                  </button>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewProductModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#3b5971] py-2.5 text-sm font-bold text-white hover:bg-[#2f485c] shadow-sm"
                >
                  إضافة للفاتورة والمخزن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScannerDetected}
        title={isSale ? 'مسح باركود منتج للبيع' : 'مسح باركود منتج للتوريد'}
      />

      {/* Pick Product Modal */}
      {pickModalOpen && (
        <ProductPickModal
          isOpen={pickModalOpen}
          onClose={() => setPickModalOpen(false)}
          onSelect={(p) => {
            addProductToInvoice(p);
            setPickModalOpen(false);
          }}
          onOpenCreateNew={() => {
            setPickModalOpen(false);
            setNewProductModalOpen(true);
          }}
        />
      )}

      {/* Add New Party Modal */}
      {newPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-3">
              {isSale ? 'إضافة عميل جديد' : 'إضافة مورد جديد'}
            </h3>
            <form onSubmit={handleCreateParty} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">الاسم</label>
                <input
                  type="text"
                  required
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  placeholder="مثال: أحمد محمد"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">رقم الهاتف</label>
                <input
                  type="tel"
                  value={newPartyPhone}
                  onChange={(e) => setNewPartyPhone(e.target.value)}
                  placeholder="مثال: 07701234567"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewPartyModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#3b5971] py-2 text-sm font-bold text-white hover:bg-[#2f485c]"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Single Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xs max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl space-y-3">
            <h3 className="text-sm font-black text-[#1e4663] text-center">تعديل بيانات الصنف والمنتج</h3>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-600">الصنف (التصنيف)</label>
                <button
                  type="button"
                  onClick={() =>
                    setEditingItem({
                      ...editingItem,
                      isCustomCategory: !editingItem.isCustomCategory,
                    })
                  }
                  className="text-[11px] font-bold text-[#0d9488] hover:underline cursor-pointer"
                >
                  {editingItem.isCustomCategory ? 'اختيار من الأصناف' : '+ كتابة أو تعديل الصنف'}
                </button>
              </div>
              {editingItem.isCustomCategory ? (
                <input
                  type="text"
                  value={editingItem.category}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  placeholder="اكتب اسم الصنف..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500 focus:outline-hidden"
                />
              ) : (
                <select
                  value={editingItem.category}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500 focus:outline-hidden"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">اسم المنتج</label>
              <input
                type="text"
                value={editingItem.name}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">العدد / الكمية</label>
              <input
                type="number"
                step="any"
                min="0.1"
                value={editingItem.qty}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, qty: parseFloat(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {isSale ? `سعر البيع (${invoiceCurrency})` : `سعر الشراء (${invoiceCurrency})`}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={editingItem.price}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-hidden"
              />
            </div>
            {!isSale && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  سعر البيع للمستهلك ({invoiceCurrency})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editingItem.sell_price ?? ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      sell_price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-hidden"
                />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="flex-1 rounded-xl border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveItemEdit}
                className="flex-1 rounded-xl bg-[#3b5971] py-2 text-xs font-bold text-white hover:bg-[#2f485c]"
              >
                حفظ التعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import & Pricing Modal (for Purchases) */}
      <ExcelImportModal
        isOpen={excelImportOpen}
        onClose={() => setExcelImportOpen(false)}
        mode="purchase_invoice"
        onImportComplete={(importedList: ImportedExcelProductResult[]) => {
          setItems((prev) => {
            const next = [...prev];
            importedList.forEach(({ product, importedQty, importedBuyPrice, chosenSellPrice }) => {
              const existingIdx = next.findIndex((i) => i.product_id === product.id);
              if (existingIdx >= 0) {
                next[existingIdx] = {
                  ...next[existingIdx],
                  qty: next[existingIdx].qty + importedQty,
                  price: isSale ? chosenSellPrice : importedBuyPrice,
                  sell_price: chosenSellPrice,
                  cost: importedBuyPrice,
                  initialAddedQty: (next[existingIdx].initialAddedQty || 0) + importedQty,
                };
              } else {
                next.push({
                  product_id: product.id,
                  name: product.name,
                  category: product.category,
                  qty: importedQty,
                  price: isSale ? chosenSellPrice : importedBuyPrice,
                  cost: importedBuyPrice,
                  sell_price: chosenSellPrice,
                  image: product.image,
                  stockAlreadyAdded: true,
                  initialAddedQty: importedQty,
                });
              }
            });
            return next;
          });
        }}
      />

      {/* Receipt Preview Modal */}
      <ReceiptModal
        isOpen={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        invoice={savedInvoice}
        items={savedItems}
      />
    </div>
  );
};

// Subcomponent: Pick Product Modal
interface ProductPickModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  onOpenCreateNew: () => void;
}

const ProductPickModal: React.FC<ProductPickModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  onOpenCreateNew,
}) => {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const settings = DB.getSettings();

  useEffect(() => {
    if (isOpen) {
      setProducts(DB.getProducts(search));
    }
  }, [isOpen, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h3 className="font-bold text-slate-800 text-base">اختر منتج من المخزن</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCreateNew}
              className="rounded-lg bg-[#3b5971] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#2f485c] transition"
            >
              + كتابة نوع جديد
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الباركود أو الصنف..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-[#3b5971] focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 p-2">
          {products.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-slate-400">لا توجد منتجات مطابقة</p>
              <button
                type="button"
                onClick={onOpenCreateNew}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 border border-amber-200"
              >
                <PackagePlus className="h-3.5 w-3.5" /> إضافة نوع جديد
              </button>
            </div>
          ) : (
            products.map((p) => {
              const isOut = p.qty <= 0;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition"
                >
                  <div className="flex items-center gap-3">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className="h-11 w-11 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <ShoppingBag className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <h4
                        style={{ fontSize: `${settings.productsFontSize || 15}px` }}
                        className="font-bold text-slate-800"
                      >
                        {p.name}
                      </h4>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                        <span>بيع: {p.sell_price.toFixed(0)} {settings.currency}</span>
                        <span>•</span>
                        <span>شراء: {p.buy_price.toFixed(0)} {settings.currency}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        isOut ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {p.qty}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
