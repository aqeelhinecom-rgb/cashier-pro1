import { CashierDatabase } from '../schema';
import {
  StorageInvoice,
  StorageInvoiceItem,
  InvoiceType,
  InsufficientStockError,
} from '../types';
import { generateUUID } from '../uuid';

export interface CreateInvoiceParams {
  type: InvoiceType;
  partyId?: number | null;
  items: Omit<StorageInvoiceItem, 'id' | 'invoice_id' | 'uuid' | 'updatedAt'>[];
  discount: number;
  paid: number;
  currency?: string;
  notes?: string;
  date?: string;
  customInvoiceNumber?: string;
  idempotencyKey?: string;
}

export interface CreateInvoiceResult {
  invoice: StorageInvoice;
  items: StorageInvoiceItem[];
  deduplicated?: boolean;
  stockChanges?: { productId: number; oldQty: number; newQty: number }[];
}

export interface VoidInvoiceResult {
  voided: boolean;
  alreadyVoided?: boolean;
  stockChanges: { productId: number; oldQty: number; newQty: number }[];
  conflicts: { productId: number; conflictType: string; expectedDelta: number; actualJournalDelta: number | null }[];
}

function parseInvoiceSeqNumber(invoiceNumber?: string): number {
  if (!invoiceNumber) return 0;
  const match = String(invoiceNumber).match(/(\d+)$/);
  return match ? parseInt(match[1], 10) || 0 : 0;
}

export class InvoiceRepository {
  constructor(private db: CashierDatabase) {}

  async getAll(type?: InvoiceType): Promise<StorageInvoice[]> {
    let collection = this.db.invoices.filter((inv) => !inv.isDeleted);
    if (type) {
      collection = collection.filter((inv) => inv.type === type);
    }
    const list = await collection.toArray();
    return list.sort((a, b) => b.id - a.id);
  }

  async getById(id: number): Promise<StorageInvoice | undefined> {
    const inv = await this.db.invoices.get(id);
    return inv && !inv.isDeleted ? inv : undefined;
  }

  async getByUuid(uuid: string): Promise<StorageInvoice | undefined> {
    const inv = await this.db.invoices.where('uuid').equals(uuid).first();
    return inv && !inv.isDeleted ? inv : undefined;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<StorageInvoice | undefined> {
    const clean = idempotencyKey.trim();
    if (!clean) return undefined;
    return this.db.invoices.where('idempotencyKey').equals(clean).first();
  }

  async getItems(invoiceId: number): Promise<StorageInvoiceItem[]> {
    return this.db.invoice_items.where('invoice_id').equals(invoiceId).toArray();
  }

  /**
   * Saves an invoice atomically:
   * 1. Enforces idempotencyKey deduplication inside the rw transaction
   * 2. Validates non-empty items and available stock for sales atomically (no negative stock / no Math.max masking)
   * 3. Inserts the invoice and all invoice_items
   * 4. Updates product stock & prices atomically
   * 5. Appends immutable Change Journal records including exact stock deltas
   */
  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    const {
      type,
      partyId,
      items,
      discount,
      paid,
      currency,
      notes,
      date,
      customInvoiceNumber,
      idempotencyKey,
    } = params;

    const cleanIdempotencyKey = idempotencyKey?.trim() || '';
    const resolvedIdempotencyKey = cleanIdempotencyKey || generateUUID();

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('لا يمكن حفظ فاتورة فارغة بدون أصناف.');
    }

    for (const item of items) {
      const q = Number(item.qty);
      if (!Number.isFinite(q) || q <= 0) {
        throw new Error(`كمية غير صالحة للصنف "${item.name}". يجب أن تكون أكبر من صفر.`);
      }
    }

    const now = date || new Date().toISOString();
    const subtotal = items.reduce((sum, item) => sum + Number(item.qty) * Number(item.price), 0);
    const total = Math.max(0, subtotal - (Number(discount) || 0));

    return this.db.transaction(
      'rw',
      [
        this.db.invoices,
        this.db.invoice_items,
        this.db.products,
        this.db.parties,
        this.db.settings,
        this.db.change_journal,
      ],
      async () => {
        // 0. Enforce idempotencyKey inside the atomic rw transaction
        if (cleanIdempotencyKey) {
          const existingByKey = await this.db.invoices
            .where('idempotencyKey')
            .equals(cleanIdempotencyKey)
            .first();
          if (existingByKey) {
            const existingItems = await this.db.invoice_items
              .where('invoice_id')
              .equals(existingByKey.id)
              .toArray();
            return {
              invoice: existingByKey,
              items: existingItems,
              deduplicated: true,
              stockChanges: [],
            };
          }
        }

        // 1. Authoritative Stock Availability Check for Sales (aggregated per product)
        if (type === 'sale') {
          const requestedByProduct = new Map<number, { qty: number; name: string }>();
          for (const item of items) {
            const prev = requestedByProduct.get(item.product_id);
            const itemQty = Number(item.qty);
            if (prev) {
              prev.qty += itemQty;
            } else {
              requestedByProduct.set(item.product_id, { qty: itemQty, name: item.name });
            }
          }

          for (const [productId, req] of requestedByProduct.entries()) {
            const product = await this.db.products.get(productId);
            if (!product || product.isDeleted) {
              throw new Error(`المنتج "${req.name}" غير موجود في المخزن.`);
            }
            const availableQty = Number(product.qty) || 0;
            if (req.qty > availableQty) {
              throw new InsufficientStockError(product.id, product.name, req.qty, availableQty);
            }
          }
        }

        // 2. Resolve party name if partyId provided
        let partyName: string | undefined;
        if (partyId) {
          const party = await this.db.parties.get(partyId);
          partyName = party?.name;
        } else if (type === 'sale' || type === 'sale_return' || type === 'quote') {
          partyName = 'مفرد';
        }

        // 3. Determine display invoice number monotonically and collision-free
        let invoiceNumber = customInvoiceNumber;
        if (!invoiceNumber) {
          const seqKey = `seq_${type}`;
          const seqRec = await this.db.settings.get(seqKey);
          const allInvoices = await this.db.invoices.toArray();
          const maxExistingForType = allInvoices
            .filter((inv) => inv.type === type)
            .reduce((m, inv) => Math.max(m, inv.id || 0, parseInvoiceSeqNumber(inv.invoice_number)), 0);

          let nextSeq = 1;
          if (seqRec && typeof seqRec.value === 'number') {
            nextSeq = Math.max(seqRec.value, maxExistingForType) + 1;
          } else {
            const maxAnyId = allInvoices.reduce((m, inv) => Math.max(m, inv.id || 0), 0);
            nextSeq = Math.max(maxAnyId, maxExistingForType) + 1;
          }
          await this.db.settings.put({ key: seqKey, value: nextSeq });
          const prefix = type === 'purchase' ? 'PO' : type === 'sale_return' ? 'RET' : 'INV';
          invoiceNumber = `${prefix}-${nextSeq}`;
        }

        const newInvoice: StorageInvoice = {
          type,
          party_id: partyId || null,
          party_name: partyName,
          date: now,
          discount: Number(discount) || 0,
          total,
          paid: Number(paid) || 0,
          currency: currency?.trim() || 'د.ع',
          invoice_number: invoiceNumber,
          idempotencyKey: resolvedIdempotencyKey,
          uuid: generateUUID(),
          notes: notes?.trim(),
          updatedAt: now,
          isDeleted: false,
        } as StorageInvoice;

        const invoiceId = await this.db.invoices.add(newInvoice);
        newInvoice.id = invoiceId;

        // 4. Insert items
        const createdItems: StorageInvoiceItem[] = [];
        for (const item of items) {
          const storageItem: StorageInvoiceItem = {
            invoice_id: invoiceId,
            product_id: item.product_id,
            name: item.name,
            category: item.category,
            qty: Number(item.qty),
            price: Number(item.price),
            cost: Number(item.cost),
            sell_price: item.sell_price !== undefined ? Number(item.sell_price) : undefined,
            image: item.image,
            stockAlreadyAdded: item.stockAlreadyAdded,
            initialAddedQty: item.initialAddedQty,
            uuid: generateUUID(),
            updatedAt: now,
          };

          const itemId = await this.db.invoice_items.add(storageItem);
          storageItem.id = itemId;
          createdItems.push(storageItem);
        }

        // 5. Update Stock atomically (no Math.max masking for sale)
        const stockChanges: { productId: number; productUuid: string; oldQty: number; newQty: number }[] = [];
        if (type !== 'quote') {
          for (const item of items) {
            const product = await this.db.products.get(item.product_id);
            if (!product) continue;

            const oldQty = Number(product.qty) || 0;
            let newQty = oldQty;
            let newBuyPrice = product.buy_price;
            let newSellPrice = product.sell_price;
            const itemQty = Number(item.qty);

            if (type === 'sale') {
              newQty = oldQty - itemQty;
              if (newQty < 0) {
                throw new InsufficientStockError(product.id, product.name, itemQty, oldQty);
              }
            } else if (type === 'sale_return') {
              newQty = oldQty + itemQty;
            } else if (type === 'purchase') {
              if (item.stockAlreadyAdded) {
                const diff = itemQty - (Number(item.initialAddedQty) || 0);
                newQty = oldQty + diff;
                if (newQty < 0) {
                  throw new InsufficientStockError(product.id, product.name, Math.abs(diff), oldQty);
                }
              } else {
                newQty = oldQty + itemQty;
              }
              newBuyPrice = Number(item.price);
              if (item.sell_price !== undefined && Number(item.sell_price) > 0) {
                newSellPrice = Number(item.sell_price);
              }
            }

            await this.db.products.update(product.id, {
              qty: newQty,
              buy_price: newBuyPrice,
              sell_price: newSellPrice,
              version: (product.version || 1) + 1,
              updatedAt: now,
            });

            stockChanges.push({
              productId: product.id,
              productUuid: product.uuid,
              oldQty,
              newQty,
            });
          }
        }

        // 6. Atomic Change Journal Recording
        if (this.db.change_journal) {
          await this.db.change_journal.add({
            operationId: newInvoice.uuid,
            table: 'invoices',
            action: 'create',
            recordId: invoiceId,
            recordUuid: newInvoice.uuid,
            timestamp: now,
            afterState: newInvoice,
          });

          for (const it of createdItems) {
            await this.db.change_journal.add({
              operationId: it.uuid,
              table: 'invoice_items',
              action: 'create',
              recordId: it.id!,
              recordUuid: it.uuid,
              timestamp: now,
              afterState: it,
            });
          }

          for (const sc of stockChanges) {
            await this.db.change_journal.add({
              operationId: generateUUID(),
              table: 'products',
              action: 'stock_change',
              recordId: sc.productId,
              recordUuid: sc.productUuid,
              timestamp: now,
              diff: {
                oldQty: sc.oldQty,
                newQty: sc.newQty,
                delta: sc.newQty - sc.oldQty,
                invoiceId,
                invoiceUuid: newInvoice.uuid,
                invoiceType: type,
                reason: 'invoice_create',
              },
            });
          }
        }

        return {
          invoice: newInvoice,
          items: createdItems,
          deduplicated: false,
          stockChanges: stockChanges.map(({ productId, oldQty, newQty }) => ({
            productId,
            oldQty,
            newQty,
          })),
        };
      }
    );
  }

  /**
   * Voids/deletes an invoice atomically:
   * - Idempotent: refuses duplicate void / stock reversal if already voided
   * - Reverses ONLY actual stock movements recorded in Change Journal (never blindly adds item.qty)
   * - Preserves all historical Change Journal records and logs inconsistencies in audit_logs without creating phantom stock
   */
  async deleteInvoice(id: number, soft = true): Promise<VoidInvoiceResult> {
    return this.db.transaction(
      'rw',
      [
        this.db.invoices,
        this.db.invoice_items,
        this.db.products,
        this.db.change_journal,
        this.db.audit_logs,
      ],
      async () => {
        const invoice = await this.db.invoices.get(id);
        if (!invoice || invoice.isDeleted) {
          return {
            voided: false,
            alreadyVoided: Boolean(invoice?.isDeleted),
            stockChanges: [],
            conflicts: [],
          };
        }

        // Prevent duplicate reversal via Change Journal check as well
        if (this.db.change_journal) {
          const priorVoid = await this.db.change_journal
            .where('recordId')
            .equals(id)
            .filter((e) => e.table === 'invoices' && e.action === 'void')
            .first();
          if (priorVoid) {
            return {
              voided: false,
              alreadyVoided: true,
              stockChanges: [],
              conflicts: [],
            };
          }
        }

        const items = await this.db.invoice_items.where('invoice_id').equals(id).toArray();
        const now = new Date().toISOString();

        const stockRollbacks: {
          productId: number;
          productUuid: string;
          oldQty: number;
          newQty: number;
          reverseDelta: number;
        }[] = [];
        const conflicts: VoidInvoiceResult['conflicts'] = [];

        if (invoice.type !== 'quote' && items.length > 0) {
          // Calculate expected movement per product from invoice items
          const expectedDeltaByProduct = new Map<number, number>();
          for (const item of items) {
            const itemQty = Number(item.qty) || 0;
            let delta = 0;
            if (invoice.type === 'sale') {
              delta = -itemQty;
            } else if (invoice.type === 'sale_return') {
              delta = itemQty;
            } else if (invoice.type === 'purchase') {
              delta = item.stockAlreadyAdded
                ? itemQty - (Number(item.initialAddedQty) || 0)
                : itemQty;
            }
            expectedDeltaByProduct.set(
              item.product_id,
              (expectedDeltaByProduct.get(item.product_id) || 0) + delta
            );
          }

          // Lookup actual recorded stock movements in Change Journal
          const recordedDeltaByProduct = new Map<number, number>();
          if (this.db.change_journal) {
            const allProductStockEntries = await this.db.change_journal
              .where('table')
              .equals('products')
              .filter((e) => e.action === 'stock_change' && e.diff?.reason !== 'invoice_void')
              .toArray();

            // 1. Direct match via invoiceId / invoiceUuid
            let matchedEntries = allProductStockEntries.filter(
              (e) =>
                e.diff?.invoiceId === id ||
                (invoice.uuid && e.diff?.invoiceUuid === invoice.uuid)
            );

            // 2. Fallback match for pre-Phase-22 historical invoices using exact timestamp + productId
            if (matchedEntries.length === 0 && invoice.updatedAt) {
              matchedEntries = allProductStockEntries.filter(
                (e) =>
                  e.diff?.invoiceId === undefined &&
                  e.diff?.invoiceUuid === undefined &&
                  e.timestamp === invoice.updatedAt &&
                  expectedDeltaByProduct.has(Number(e.recordId))
              );
            }

            for (const entry of matchedEntries) {
              const pid = Number(entry.recordId);
              const entryDelta =
                typeof entry.diff?.delta === 'number'
                  ? entry.diff.delta
                  : Number(entry.diff?.newQty) - Number(entry.diff?.oldQty);
              if (Number.isFinite(entryDelta)) {
                recordedDeltaByProduct.set(
                  pid,
                  (recordedDeltaByProduct.get(pid) || 0) + entryDelta
                );
              }
            }
          }

          for (const [productId, expectedDelta] of expectedDeltaByProduct.entries()) {
            const recordedDelta = recordedDeltaByProduct.get(productId);

            if (recordedDelta === undefined) {
              // Historical/untracked invoice with no journal movement -> log conflict & do NOT create phantom stock
              conflicts.push({
                productId,
                conflictType: 'missing_journal_stock_movement',
                expectedDelta,
                actualJournalDelta: null,
              });
              if (this.db.audit_logs) {
                await this.db.audit_logs.add({
                  uuid: generateUUID(),
                  action: 'void',
                  entity: 'invoice',
                  entityId: id,
                  timestamp: now,
                  details: {
                    conflictType: 'missing_journal_stock_movement',
                    productId,
                    expectedDelta,
                    actualJournalDelta: null,
                    invoiceType: invoice.type,
                    invoiceNumber: invoice.invoice_number,
                    note: 'لم يتم تعديل المخزون لعدم وجود حركة مسجلة في سجل التغييرات',
                  },
                });
              }
              continue;
            }

            if (Math.abs(recordedDelta - expectedDelta) > 1e-6) {
              // Inconsistent historical invoice (e.g. Phase 21 zero-stock oversell where expected=-5, recorded=0)
              conflicts.push({
                productId,
                conflictType: 'journal_qty_mismatch',
                expectedDelta,
                actualJournalDelta: recordedDelta,
              });
              if (this.db.audit_logs) {
                await this.db.audit_logs.add({
                  uuid: generateUUID(),
                  action: 'void',
                  entity: 'invoice',
                  entityId: id,
                  timestamp: now,
                  details: {
                    conflictType: 'journal_qty_mismatch',
                    productId,
                    expectedDelta,
                    actualJournalDelta: recordedDelta,
                    reverseApplied: -recordedDelta,
                    invoiceType: invoice.type,
                    invoiceNumber: invoice.invoice_number,
                    note: 'تم عكس الحركة الفعلية المسجلة فقط ومنع تصنيع مخزون وهمي',
                  },
                });
              }
            }

            const reverseDelta = -recordedDelta;
            if (reverseDelta !== 0) {
              const product = await this.db.products.get(productId);
              if (product) {
                const oldQty = Number(product.qty) || 0;
                const newQty = oldQty + reverseDelta;
                if (newQty < 0) {
                  throw new InsufficientStockError(
                    product.id,
                    product.name,
                    Math.abs(reverseDelta),
                    oldQty
                  );
                }

                await this.db.products.update(product.id, {
                  qty: newQty,
                  version: (product.version || 1) + 1,
                  updatedAt: now,
                });

                stockRollbacks.push({
                  productId: product.id,
                  productUuid: product.uuid,
                  oldQty,
                  newQty,
                  reverseDelta,
                });
              }
            }
          }
        }

        if (soft) {
          await this.db.invoices.update(id, {
            isDeleted: true,
            updatedAt: now,
          });
        } else {
          await this.db.invoices.delete(id);
          await this.db.invoice_items.where('invoice_id').equals(id).delete();
        }

        // Preserve all prior Change Journal entries; only append new void & rollback entries
        if (this.db.change_journal) {
          await this.db.change_journal.add({
            operationId: generateUUID(),
            table: 'invoices',
            action: 'void',
            recordId: id,
            recordUuid: invoice.uuid,
            timestamp: now,
            beforeState: invoice,
            afterState: soft ? { ...invoice, isDeleted: true, updatedAt: now } : undefined,
            diff: conflicts.length > 0 ? { conflicts } : undefined,
          });

          for (const sr of stockRollbacks) {
            await this.db.change_journal.add({
              operationId: generateUUID(),
              table: 'products',
              action: 'stock_change',
              recordId: sr.productId,
              recordUuid: sr.productUuid,
              timestamp: now,
              diff: {
                oldQty: sr.oldQty,
                newQty: sr.newQty,
                delta: sr.reverseDelta,
                invoiceId: id,
                invoiceUuid: invoice.uuid,
                reason: 'invoice_void',
              },
            });
          }
        }

        return {
          voided: true,
          stockChanges: stockRollbacks.map(({ productId, oldQty, newQty }) => ({
            productId,
            oldQty,
            newQty,
          })),
          conflicts,
        };
      }
    );
  }
}
