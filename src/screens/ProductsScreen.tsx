import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Barcode,
  Image as ImageIcon,
  Check,
  Tag,
  FileSpreadsheet,
} from 'lucide-react';
import { DB } from '../services/db';
import { Product } from '../types';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { playSuccessChime } from '../services/audio';
import { compressImageFile } from '../utils/image';
import { useBackHandler } from '../services/navigation';

type SortField = 'name' | 'qty' | 'price';
type SortDirection = 'asc' | 'desc';

export const ProductsScreen: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [productsFontSize, setProductsFontSize] = useState<number>(
    DB.getSettings().productsFontSize || 15
  );

  // In-app Quick Add Qty & Delete Confirmation modals
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [quickAddAmount, setQuickAddAmount] = useState('5');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category Manager Modal state (إدارة الأصناف: إضافة وتعديل وحذف)
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState('');

  // Step-by-step phone Back button handlers
  useBackHandler(selectedProduct !== null, () => setSelectedProduct(null));
  useBackHandler(editModalOpen, () => setEditModalOpen(false));
  useBackHandler(addModalOpen, () => setAddModalOpen(false));
  useBackHandler(scannerOpen, () => setScannerOpen(false));
  useBackHandler(quickAddModalOpen, () => setQuickAddModalOpen(false));
  useBackHandler(confirmDeleteOpen, () => setConfirmDeleteOpen(false));
  useBackHandler(categoriesModalOpen, () => setCategoriesModalOpen(false));

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editBuyPrice, setEditBuyPrice] = useState('');
  const [editSellPrice, setEditSellPrice] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [isEditCustomCategory, setIsEditCustomCategory] = useState(false);
  const [editImage, setEditImage] = useState<string | undefined>(undefined);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Add Product fields
  const [newName, setNewName] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newCategory, setNewCategory] = useState('عام');
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [newBuyPrice, setNewBuyPrice] = useState('');
  const [newSellPrice, setNewSellPrice] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newImage, setNewImage] = useState<string>('');
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const settings = DB.getSettings();
  const currency = settings.currency || 'د.ع';

  const loadProducts = () => {
    setProducts(DB.getProducts(search));
    setCategories(DB.getCategories());
    setProductsFontSize(DB.getSettings().productsFontSize || 15);
  };

  useEffect(() => {
    loadProducts();
    return DB.subscribe(loadProducts);
  }, [search]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (stockFilter === 'out' && p.qty > 0) return false;
    if (stockFilter === 'low' && (p.qty <= 0 || p.qty > 5)) return false;
    if (categoryFilter !== 'all' && (p.category || 'عام') !== categoryFilter) return false;
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'name') {
      comparison = a.name.localeCompare(b.name, 'ar');
    } else if (sortField === 'qty') {
      comparison = a.qty - b.qty;
    } else if (sortField === 'price') {
      comparison = a.sell_price - b.sell_price;
    }
    return sortDir === 'asc' ? comparison : -comparison;
  });

  const allWarehouseProducts = DB.getProducts();
  const totalBuyVal = allWarehouseProducts.reduce((s, p) => s + p.qty * p.buy_price, 0);
  const totalSellVal = allWarehouseProducts.reduce((s, p) => s + p.qty * p.sell_price, 0);
  const outCount = allWarehouseProducts.filter((p) => p.qty <= 0).length;
  const lowCount = allWarehouseProducts.filter((p) => p.qty > 0 && p.qty <= 5).length;

  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setEditName(p.name);
    setEditBarcode(p.barcode || '');
    setEditQty(p.qty.toString());
    setEditBuyPrice(p.buy_price.toString());
    setEditSellPrice(p.sell_price.toString());
    setEditCategory(p.category || 'عام');
    setIsEditCustomCategory(false);
    setEditImage(p.image);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleOpenEditModal = (p: Product) => {
    setSelectedProduct(p);
    setEditName(p.name);
    setEditBarcode(p.barcode || '');
    setEditQty(p.qty.toString());
    setEditBuyPrice(p.buy_price.toString());
    setEditSellPrice(p.sell_price.toString());
    setEditCategory(p.category || 'عام');
    setIsEditCustomCategory(false);
    setEditImage(p.image);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const finalCat = editCategory.trim() || 'عام';
      await DB.addCategory(finalCat);

      const updated = await DB.saveProduct({
        ...selectedProduct,
        name: editName.trim() || selectedProduct.name,
        barcode: editBarcode.trim(),
        category: finalCat,
        qty: parseFloat(editQty) || 0,
        buy_price: parseFloat(editBuyPrice) || 0,
        sell_price: parseFloat(editSellPrice) || 0,
        image: editImage,
      });

      playSuccessChime();
      setSelectedProduct(updated);
      setEditModalOpen(false);
    } catch (err) {
      console.error('Failed to save product edit:', err);
      alert('حدث خطأ أثناء حفظ تعديلات المنتج');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCategoryInput.trim();
    if (!clean || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await DB.addCategory(clean);
      setNewCategory(clean);
      setEditCategory(clean);
      setNewCategoryInput('');
      playSuccessChime();
    } catch (err) {
      console.error('Failed to add category:', err);
      alert('حدث خطأ أثناء إضافة الصنف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRenamedCategory = async (oldName: string) => {
    const cleanNew = editingCategoryValue.trim();
    if (cleanNew && cleanNew !== oldName && !isSubmitting) {
      try {
        setIsSubmitting(true);
        await DB.renameCategory(oldName, cleanNew);
        if (categoryFilter === oldName) setCategoryFilter(cleanNew);
        if (newCategory === oldName) setNewCategory(cleanNew);
        if (editCategory === oldName) setEditCategory(cleanNew);
        if (selectedProduct && selectedProduct.category === oldName) {
          setSelectedProduct({ ...selectedProduct, category: cleanNew });
        }
        playSuccessChime();
      } catch (err) {
        console.error('Failed to rename category:', err);
        alert('حدث خطأ أثناء تعديل اسم الصنف');
      } finally {
        setIsSubmitting(false);
      }
    }
    setEditingCategoryName(null);
    setEditingCategoryValue('');
  };

  const handleConfirmQuickAddQty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || isSubmitting) return;
    const delta = parseFloat(quickAddAmount);
    if (!isNaN(delta) && delta > 0) {
      try {
        setIsSubmitting(true);
        await DB.updateStockQuantity(selectedProduct.id, delta);
        playSuccessChime();
        setSelectedProduct({ ...selectedProduct, qty: selectedProduct.qty + delta });
        setQuickAddModalOpen(false);
      } catch (err) {
        console.error('Failed to update stock qty:', err);
        alert('حدث خطأ أثناء تحديث الكمية');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setQuickAddModalOpen(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const finalCat = isCustomCategory
        ? customCategory.trim() || 'عام'
        : newCategory.trim() || 'عام';

      await DB.saveProduct({
        name: newName.trim(),
        barcode: newBarcode.trim() || undefined,
        category: finalCat,
        buy_price: parseFloat(newBuyPrice) || 0,
        sell_price: parseFloat(newSellPrice) || 0,
        qty: parseFloat(newQty) || 0,
        image: newImage || undefined,
      });

      playSuccessChime();
      setNewName('');
      setNewBarcode('');
      setNewCategory('عام');
      setCustomCategory('');
      setIsCustomCategory(false);
      setNewBuyPrice('');
      setNewSellPrice('');
      setNewQty('1');
      setNewImage('');
      setAddModalOpen(false);
    } catch (err) {
      console.error('Failed to create product:', err);
      alert('حدث خطأ أثناء حفظ المنتج الجديد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await DB.deleteProduct(selectedProduct.id);
      playSuccessChime();
      setConfirmDeleteOpen(false);
      setSelectedProduct(null);
    } catch (err) {
      console.error('Failed to delete product:', err);
      alert('حدث خطأ أثناء حذف المنتج');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await DB.deleteCategory(cat);
      if (categoryFilter === cat) setCategoryFilter('all');
      playSuccessChime();
    } catch (err) {
      console.error('Failed to delete category:', err);
      alert('حدث خطأ أثناء حذف الصنف');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-4 max-w-3xl mx-auto">
      {/* If a product is selected for detail view */}
      {selectedProduct ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-xs font-bold text-slate-500 hover:text-[#1e4663] flex items-center gap-1 cursor-pointer"
            >
              ← العودة للمخزن
            </button>
            <h2 className="text-base font-extrabold text-[#1e4663]">تفاصيل المنتج</h2>
          </div>

          <div className="text-center pt-2">
            {selectedProduct.image && (
              <div className="mb-3 flex justify-center">
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                  className="h-24 w-24 rounded-2xl object-cover border border-slate-200 shadow-xs"
                />
              </div>
            )}
            <h3 className="text-xl font-black text-slate-900">{selectedProduct.name}</h3>
            {selectedProduct.category && (
              <p className="mt-1 text-xs font-bold text-[#0d9488]">
                الصنف: {selectedProduct.category}
              </p>
            )}

            <button
              onClick={() => setShowMoreDetails(!showMoreDetails)}
              className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 mx-auto cursor-pointer"
            >
              <span>عرض المزيد</span>
              {showMoreDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showMoreDetails && (
              <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1 text-right">
                <p>الباركود: <span className="font-mono">{selectedProduct.barcode || 'بدون باركود'}</span></p>
                <p>الصنف: {selectedProduct.category || 'عام'}</p>
                <p>
                  ربح القطعة الواحدة:{' '}
                  <span className="font-mono font-bold text-emerald-700">
                    {Math.max(0, selectedProduct.sell_price - selectedProduct.buy_price).toFixed(0)} {currency}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Harmonized Metric Bar */}
          <div className="grid grid-cols-4 bg-[#1e4663] text-white rounded-xl text-center py-3 text-xs font-bold">
            <div>
              <span className="text-slate-200 block text-[10px]">رصيد المخزن</span>
              <span
                className={`text-base font-mono font-black ${
                  selectedProduct.qty <= 0 ? 'text-red-300' : ''
                }`}
              >
                {selectedProduct.qty}
              </span>
            </div>
            <div>
              <span className="text-slate-200 block text-[10px]">سعر الشراء</span>
              <span className="text-base font-mono font-black">{selectedProduct.buy_price.toFixed(0)}</span>
            </div>
            <div>
              <span className="text-slate-200 block text-[10px]">سعر البيع</span>
              <span className="text-base font-mono font-black">{selectedProduct.sell_price.toFixed(0)}</span>
            </div>
            <div>
              <span className="text-slate-200 block text-[10px]">ربح المفرد</span>
              <span className="text-base font-mono font-black text-teal-300">
                {(selectedProduct.sell_price - selectedProduct.buy_price).toFixed(0)}
              </span>
            </div>
          </div>

          {/* Total quantity & purchase value in warehouse */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 text-xs sm:text-sm">الكمية الاجمالية بالمخزن</span>
              <span
                className={`font-black font-mono text-base px-3 py-0.5 rounded-lg border ${
                  selectedProduct.qty <= 0
                    ? 'text-[#b91c1c] bg-red-50 border-red-200'
                    : 'text-[#1e4663] bg-slate-100 border-slate-200'
                }`}
              >
                {selectedProduct.qty}
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700 text-xs sm:text-sm">قيمة الموجود (بسعر الشراء)</span>
              <span className="font-black font-mono text-base text-[#0d9488]">
                {(selectedProduct.qty * selectedProduct.buy_price).toFixed(0)} {currency}
              </span>
            </div>
          </div>

          {/* Action buttons at bottom */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
            <button
              onClick={() => handleOpenEditModal(selectedProduct)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#1e4663] transition cursor-pointer"
            >
              <Edit2 className="h-5 w-5 mb-1" />
              <span className="text-xs font-bold">تعديل المنتج</span>
            </button>

            <button
              onClick={() => {
                setQuickAddAmount('5');
                setQuickAddModalOpen(true);
              }}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-teal-50/70 hover:bg-teal-100/70 text-[#0d9488] transition cursor-pointer"
            >
              <Plus className="h-5 w-5 mb-1" />
              <span className="text-xs font-bold">اضف كمية سريعة</span>
            </button>

            <button
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-50/60 hover:bg-red-100/70 text-[#b91c1c] transition cursor-pointer"
            >
              <Trash2 className="h-5 w-5 mb-1" />
              <span className="text-xs font-bold">حذف المنتج</span>
            </button>
          </div>
        </div>
      ) : (
        /* Products List view */
        <div className="space-y-2.5 sm:space-y-3">
          {/* Warehouse Valuation Strip */}
          <div className="grid grid-cols-3 gap-2 text-right">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 block truncate">عدد الأصناف</span>
              <span className="text-xs sm:text-sm font-black font-mono text-[#1e4663] block truncate">
                {allWarehouseProducts.length} صنف
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 block truncate">قيمة المخزن (شراء)</span>
              <span className="text-xs sm:text-sm font-black font-mono text-[#0d9488] block truncate">
                {totalBuyVal.toFixed(0)} {currency}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs min-w-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 block truncate">قيمة المخزن (بيع)</span>
              <span className="text-xs sm:text-sm font-black font-mono text-slate-900 block truncate">
                {totalSellVal.toFixed(0)} {currency}
              </span>
            </div>
          </div>

          {/* Search Bar, Stock Filter Tabs & Add New Product Button */}
          <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStockFilter('all')}
                  className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer ${
                    stockFilter === 'all'
                      ? 'bg-[#1e4663] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الكل ({allWarehouseProducts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilter('low')}
                  className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer ${
                    stockFilter === 'low'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  نواقص ({lowCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilter('out')}
                  className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer ${
                    stockFilter === 'out'
                      ? 'bg-[#b91c1c] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  منتهي 0 ({outCount})
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setExcelModalOpen(true)}
                  className="rounded-xl border border-emerald-600/30 bg-emerald-50 hover:bg-emerald-100/80 px-2.5 py-1.5 text-[11px] sm:text-xs font-extrabold text-emerald-800 flex items-center gap-1 transition cursor-pointer"
                  title="استيراد منتجات من ملف إكسل وتسعير البيع"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                  <span>من إكسل</span>
                </button>

                <button
                  onClick={() => setCategoriesModalOpen(true)}
                  className="rounded-xl border border-[#1e4663]/30 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 text-[11px] sm:text-xs font-extrabold text-[#1e4663] flex items-center gap-1 transition cursor-pointer"
                  title="إضافة أو تعديل الأصناف"
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span>الأصناف</span>
                </button>

                <button
                  onClick={() => setAddModalOpen(true)}
                  className="rounded-xl bg-[#1e4663] hover:bg-[#16354b] px-3 py-1.5 text-[11px] sm:text-xs font-extrabold text-white transition cursor-pointer"
                >
                  + إضافة منتج
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative sm:col-span-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ادخل اسم المنتج أو الباركود..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 px-3 text-xs sm:text-sm pr-9 focus:border-[#1e4663] focus:bg-white focus:outline-hidden"
                />
                <Filter className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 focus:border-[#1e4663] focus:outline-hidden"
                >
                  <option value="all">جميع الأصناف ({categories.length})</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCategoriesModalOpen(true)}
                  className="p-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[#1e4663] shrink-0 transition cursor-pointer"
                  title="إضافة أو تعديل الأصناف"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Table Header harmonized to #1e4663 */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="grid grid-cols-12 bg-[#1e4663] text-white text-xs font-bold py-2 px-3 text-center select-none">
              <button
                type="button"
                onClick={() => handleSort('name')}
                className="col-span-6 text-right flex items-center gap-1 hover:text-teal-300 transition cursor-pointer"
              >
                {sortField === 'name' ? (
                  sortDir === 'desc' ? (
                    <ArrowDown className="h-3.5 w-3.5 text-teal-300" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5 text-teal-300" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-70" />
                )}
                <span>المنتج</span>
              </button>
              <button
                type="button"
                onClick={() => handleSort('qty')}
                className="col-span-3 flex items-center justify-center gap-1 hover:text-teal-300 transition cursor-pointer"
              >
                {sortField === 'qty' ? (
                  sortDir === 'desc' ? (
                    <ArrowDown className="h-3.5 w-3.5 text-teal-300" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5 text-teal-300" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-70" />
                )}
                <span>الكمية</span>
              </button>
              <button
                type="button"
                onClick={() => handleSort('price')}
                className="col-span-3 flex items-center justify-center gap-1 hover:text-teal-300 transition cursor-pointer"
              >
                {sortField === 'price' ? (
                  sortDir === 'desc' ? (
                    <ArrowDown className="h-3.5 w-3.5 text-teal-300" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5 text-teal-300" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-70" />
                )}
                <span>السعر</span>
              </button>
            </div>

            {/* Rows */}
            {sortedProducts.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">لا توجد منتجات مطابقة</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sortedProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    style={{ fontSize: `${productsFontSize}px` }}
                    className="grid grid-cols-12 py-2.5 px-3 font-semibold hover:bg-slate-50/80 transition cursor-pointer items-center text-center"
                  >
                    <div className="col-span-6 text-right flex items-center gap-2 truncate">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          className="h-8 w-8 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : null}
                      <div className="truncate">
                        <div className="font-bold text-slate-900 truncate">{p.name}</div>
                        {p.category && (
                          <span className="text-[10px] text-slate-400 block truncate">{p.category}</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`col-span-3 font-mono ${
                        p.qty <= 0
                          ? 'text-[#b91c1c] font-black'
                          : p.qty <= 5
                          ? 'text-amber-700 font-bold'
                          : 'text-slate-700 font-bold'
                      }`}
                    >
                      {p.qty}
                    </div>
                    <div className="col-span-3 font-mono font-bold text-[#1e4663]">
                      {p.sell_price.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Add Quantity Modal */}
      {quickAddModalOpen && selectedProduct && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-[#1e4663] text-center">
              إضافة كمية سريعة للمخزن
            </h3>
            <p className="text-xs text-slate-500 text-center">{selectedProduct.name}</p>
            <form onSubmit={handleConfirmQuickAddQty} className="space-y-3">
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={quickAddAmount}
                onChange={(e) => setQuickAddAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2.5 text-center font-mono text-lg font-black text-slate-900 focus:border-[#1e4663] focus:outline-hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAddModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 py-2 text-xs font-bold text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#0d9488] hover:bg-teal-700 py-2 text-xs font-extrabold text-white"
                >
                  إضافة للمخزن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Delete Product Confirmation Modal */}
      {confirmDeleteOpen && selectedProduct && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl text-center space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">تأكيد حذف المنتج</h3>
            <p className="text-xs text-slate-600">
              هل أنت متأكد من حذف &quot;{selectedProduct.name}&quot; من المخزن؟
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="flex-1 rounded-xl border border-slate-300 py-2 text-xs font-bold text-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteProduct}
                className="flex-1 rounded-xl bg-[#b91c1c] py-2 text-xs font-extrabold text-white disabled:opacity-50"
              >
                {isSubmitting ? 'جاري الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl my-4 max-h-[92dvh] overflow-y-auto">
            <button
              onClick={() => setEditModalOpen(false)}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-black text-[#1e4663] text-center mb-4">تعديل المنتج والصنف</h3>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">الصنف (التصنيف)</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditCustomCategory(!isEditCustomCategory)}
                      className="text-[11px] font-bold text-[#0d9488] hover:underline cursor-pointer"
                    >
                      {isEditCustomCategory ? 'اختيار من القائمة' : '+ كتابة أو تعديل الصنف'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoriesModalOpen(true)}
                      className="text-[11px] font-bold text-[#1e4663] hover:underline cursor-pointer"
                    >
                      إدارة الأصناف
                    </button>
                  </div>
                </div>
                {isEditCustomCategory ? (
                  <input
                    type="text"
                    required
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="اكتب اسم الصنف الجديد أو المعدل..."
                    className="w-full rounded-xl border border-slate-300 py-2 px-3 text-sm font-bold text-slate-800 focus:border-[#1e4663] focus:outline-hidden"
                  />
                ) : (
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 py-2 px-3 text-sm font-bold text-slate-800 focus:border-[#1e4663] focus:outline-hidden"
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
                <label className="block text-xs font-bold text-slate-700 mb-1 text-right">
                  اسم المنتج
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 py-2 px-3 text-sm font-bold text-slate-900 focus:border-[#1e4663] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 text-right">
                    الكمية
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 py-2 px-3 text-center text-sm font-bold font-mono text-slate-800 focus:border-[#1e4663] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 text-right">
                    الباركود
                  </label>
                  <input
                    type="text"
                    value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)}
                    placeholder="اختياري"
                    dir="ltr"
                    className="w-full rounded-xl border border-slate-300 py-2 px-3 text-center text-sm font-mono text-slate-800 focus:border-[#1e4663] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 text-right">
                    سعر الشراء
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editBuyPrice}
                    onChange={(e) => setEditBuyPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 py-2 px-3 text-center text-sm font-bold font-mono text-slate-600 focus:border-[#1e4663] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 text-right">
                    سعر البيع
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editSellPrice}
                    onChange={(e) => setEditSellPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 py-2 px-3 text-center text-sm font-bold font-mono text-slate-900 focus:border-[#1e4663] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 text-right">
                  صورة المنتج (اختياري)
                </label>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const compressed = await compressImageFile(file);
                      setEditImage(compressed);
                    }
                  }}
                  className="hidden"
                />
                {editImage ? (
                  <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={editImage}
                      alt=""
                      className="h-11 w-11 rounded-lg object-cover"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="text-xs font-bold text-[#0d9488] px-2 py-1"
                      >
                        تغيير
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditImage('')}
                        className="text-xs font-bold text-[#b91c1c] px-2 py-1"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span>إرفاق صورة للمنتج</span>
                  </button>
                )}
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#1e4663] py-2.5 text-sm font-extrabold text-white hover:bg-[#16354b] shadow-md transition active:scale-98 cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl my-4 max-h-[92dvh] overflow-y-auto">
            <button
              onClick={() => setAddModalOpen(false)}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-black text-[#1e4663] text-center mb-4">إضافة منتج / صنف للمخزن</h3>

            <form onSubmit={handleCreateProduct} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">الصنف (التصنيف)</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCustomCategory(!isCustomCategory)}
                      className="text-[11px] font-bold text-[#0d9488] hover:underline cursor-pointer"
                    >
                      {isCustomCategory ? 'اختيار من الأصناف' : '+ كتابة صنف جديد'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoriesModalOpen(true)}
                      className="text-[11px] font-bold text-[#1e4663] hover:underline cursor-pointer"
                    >
                      تعديل الأصناف
                    </button>
                  </div>
                </div>
                {isCustomCategory ? (
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="اكتب اسم الصنف الجديد..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#1e4663] focus:outline-hidden"
                  />
                ) : (
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-[#1e4663] focus:outline-hidden"
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
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنتج</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: Lcd iph 11 pro max"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#1e4663] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الباركود</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    placeholder="رقم الباركود (اختياري)"
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1e4663] focus:outline-hidden"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="p-2 border border-slate-300 rounded-xl hover:bg-slate-100"
                  >
                    <Barcode className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر الشراء</label>
                  <input
                    type="number"
                    step="any"
                    value={newBuyPrice}
                    onChange={(e) => setNewBuyPrice(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1e4663] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر البيع</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newSellPrice}
                    onChange={(e) => setNewSellPrice(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold focus:border-[#1e4663] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العدد / الكمية الأولية</label>
                <input
                  type="number"
                  step="any"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  placeholder="1"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1e4663] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  صورة المنتج (اختياري)
                </label>
                <input
                  ref={addFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const compressed = await compressImageFile(file);
                      setNewImage(compressed);
                    }
                  }}
                  className="hidden"
                />
                {newImage ? (
                  <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={newImage}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => addFileInputRef.current?.click()}
                        className="text-xs font-bold text-[#0d9488]"
                      >
                        تغيير
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewImage('')}
                        className="text-xs font-bold text-[#b91c1c]"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => addFileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span>اختيار صورة للمنتج (اختياري)</span>
                  </button>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#1e4663] py-2.5 text-sm font-extrabold text-white hover:bg-[#16354b]"
                >
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories Management Modal (إدارة وتعديل الأصناف: إضافة أو تعديل أو حذف) */}
      {categoriesModalOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl flex flex-col max-h-[85dvh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Tag className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1e4663]">إدارة الأصناف</h3>
                  <p className="text-[10px] text-slate-500">إضافة صنف جديد أو تعديل وحذف الأصناف</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoriesModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Add new category form */}
            <form onSubmit={handleAddNewCategory} className="flex items-center gap-2 py-3 border-b border-slate-100">
              <input
                type="text"
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                placeholder="اكتب اسم صنف جديد لإضافته..."
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#1e4663] focus:bg-white focus:outline-hidden"
              />
              <button
                type="submit"
                className="rounded-xl bg-[#1e4663] hover:bg-[#16354b] text-white px-3.5 py-2 text-xs font-extrabold flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة</span>
              </button>
            </form>

            {/* List of existing categories with inline Edit & Delete */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 py-1">
              {categories.map((cat) => {
                const isEditingThis = editingCategoryName === cat;
                const count = allWarehouseProducts.filter((p) => (p.category || 'عام') === cat).length;

                return (
                  <div key={cat} className="py-2.5 px-1 flex items-center justify-between gap-2">
                    {isEditingThis ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          value={editingCategoryValue}
                          onChange={(e) => setEditingCategoryValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRenamedCategory(cat);
                            if (e.key === 'Escape') setEditingCategoryName(null);
                          }}
                          autoFocus
                          className="flex-1 rounded-lg border border-teal-500 px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRenamedCategory(cat)}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
                          title="حفظ التعديل"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryName(null)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                          title="إلغاء"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                            {cat}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                            ({count} منتج)
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryName(cat);
                              setEditingCategoryValue(cat);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#1e4663] hover:bg-slate-100 transition cursor-pointer"
                            title="تعديل اسم الصنف"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {cat !== 'عام' && (
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleDeleteCategory(cat)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#b91c1c] hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
                              title="حذف الصنف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCategoriesModalOpen(false)}
                className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 py-2 text-xs font-extrabold text-slate-700 transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import & Pricing Modal */}
      <ExcelImportModal
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        mode="warehouse"
      />

      {/* Barcode Scanner */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => {
          if (editModalOpen) {
            setEditBarcode(code);
          } else {
            setNewBarcode(code);
          }
        }}
      />
    </div>
  );
};
