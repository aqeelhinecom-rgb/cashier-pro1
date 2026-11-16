import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Invoice, InvoiceItem, StoreSettings } from '../types';

export interface PdfExportOptions {
  share?: boolean;
  shareTitle?: string;
  shareText?: string;
}

/**
 * Renders an isolated HTML string (using standard hex/rgb inline styles and Arabic RTL layout)
 * inside a clean off-screen iframe so global oklch() stylesheets never interfere with html2canvas,
 * then converts it into a multi-page A4 PDF file, saves it, and optionally opens the native Share sheet.
 */
export async function renderHtmlToPdfFile(
  innerHtml: string,
  filename: string,
  options?: PdfExportOptions
): Promise<boolean> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = '794px';
    iframe.style.height = '1123px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        cleanup();
        resolve(false);
        return;
      }

      doc.open();
      doc.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
    }
    body {
      background-color: #ffffff;
      color: #0f172a;
      direction: rtl;
      text-align: right;
      width: 794px;
      padding: 32px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
    }
    th {
      background-color: #1e4663;
      color: #ffffff;
      font-weight: 700;
      font-size: 13px;
      padding: 10px 12px;
      border: 1px solid #1e4663;
      text-align: right;
    }
    td {
      padding: 9px 12px;
      border: 1px solid #cbd5e1;
      font-size: 13px;
      color: #1e293b;
      vertical-align: middle;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
  </style>
</head>
<body>
  <div id="pdf-root">${innerHtml}</div>
</body>
</html>`);
      doc.close();

      setTimeout(async () => {
        try {
          const targetEl = doc.getElementById('pdf-root') || doc.body;
          if (doc.fonts && doc.fonts.ready) {
            await doc.fonts.ready;
          }

          const canvas = await html2canvas(targetEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: 794,
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.96);
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
          });

          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const imgWidth = pageWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          let heightLeft = imgHeight;
          let position = 0;

          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;

          while (heightLeft > 2) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }

          const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

          // Always save/download the PDF file
          pdf.save(cleanFilename);

          // If sharing is requested, also invoke native Web Share API with the PDF file if supported
          if (options?.share && typeof navigator !== 'undefined' && navigator.share) {
            try {
              const pdfBlob = pdf.output('blob');
              const pdfFile = new File([pdfBlob], cleanFilename, { type: 'application/pdf' });
              if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({
                  title: options.shareTitle || cleanFilename,
                  text: options.shareText || cleanFilename,
                  files: [pdfFile],
                });
              } else {
                await navigator.share({
                  title: options.shareTitle || cleanFilename,
                  text: options.shareText || cleanFilename,
                });
              }
            } catch {
              // User cancelled share sheet or browser only supports direct download
            }
          }

          cleanup();
          resolve(true);
        } catch (err) {
          console.error('PDF generation error:', err);
          cleanup();
          resolve(false);
        }
      }, 250);
    } catch (e) {
      console.error('PDF iframe error:', e);
      cleanup();
      resolve(false);
    }
  });
}

export async function exportInvoiceToPdf(
  invoice: Invoice,
  items: InvoiceItem[],
  settings: StoreSettings,
  options?: PdfExportOptions
): Promise<boolean> {
  const invCurrency = invoice.currency || settings.currency || 'د.ع';
  const remaining = Math.max(0, invoice.total - invoice.paid);
  const dateFormatted = new Date(invoice.date).toISOString().split('T')[0];
  const typeLabel =
    invoice.type === 'sale'
      ? 'فاتورة بيع'
      : invoice.type === 'purchase'
      ? 'فاتورة شراء'
      : invoice.type === 'sale_return'
      ? 'فاتورة مرتجع'
      : 'عرض سعر';

  const rowsHtml =
    items.length > 0
      ? items
          .map(
            (it, idx) => `
        <tr>
          <td style="text-align:center;font-weight:700;width:45px;">${idx + 1}</td>
          <td style="font-weight:700;">${it.name}</td>
          <td style="text-align:center;font-weight:700;">${it.qty}</td>
          <td style="text-align:center;">${it.price.toFixed(0)} ${invCurrency}</td>
          <td style="text-align:left;font-weight:800;color:#0f172a;">${(it.qty * it.price).toFixed(0)} ${invCurrency}</td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="5" style="text-align:center;padding:16px;color:#64748b;">لا توجد أصناف</td></tr>`;

  const html = `
    <div style="border:2px solid #1e4663;border-radius:14px;padding:24px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px;">
        <div>
          <h1 style="font-size:24px;font-weight:800;color:#1e4663;">${settings.storeName || 'Cashier'}</h1>
          ${settings.phone ? `<p style="font-size:13px;color:#475569;margin-top:4px;">هاتف: ${settings.phone}</p>` : ''}
          ${settings.address ? `<p style="font-size:13px;color:#64748b;">${settings.address}</p>` : ''}
        </div>
        <div style="text-align:left;background:#f1f5f9;padding:12px 18px;border-radius:10px;border:1px solid #cbd5e1;">
          <div style="font-size:18px;font-weight:800;color:#1e4663;">${typeLabel}</div>
          <div style="font-size:14px;font-weight:700;color:#334155;margin-top:2px;">فاتورة رقم: ${invoice.id}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">التاريخ: ${dateFormatted}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;background:#f8fafc;padding:12px 16px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:16px;font-size:14px;">
        <div>
          <span style="color:#64748b;font-weight:600;">${invoice.type === 'purchase' ? 'المورد:' : 'العميل:'}</span>
          <strong style="color:#0f172a;margin-right:6px;">${invoice.party_name || 'مفرد'}</strong>
        </div>
        <div>
          <span style="color:#64748b;font-weight:600;">العملة:</span>
          <strong style="color:#0f172a;margin-right:6px;">${invCurrency}</strong>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align:center;width:45px;">#</th>
            <th>المنتج / الصنف</th>
            <th style="text-align:center;">الكمية</th>
            <th style="text-align:center;">السعر</th>
            <th style="text-align:left;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div style="margin-top:20px;display:flex;justify-content:flex-end;">
        <div style="width:280px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:14px;">
          ${
            invoice.discount > 0
              ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#dc2626;margin-bottom:6px;">
                  <span>الخصم:</span>
                  <strong>${invoice.discount.toFixed(0)} ${invCurrency}</strong>
                </div>`
              : ''
          }
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:#1e4663;border-bottom:1px solid #cbd5e1;padding-bottom:8px;margin-bottom:8px;">
            <span>اجمالي الفاتورة:</span>
            <span style="color:#b91c1c;">${invoice.total.toFixed(0)} ${invCurrency}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#15803d;margin-bottom:4px;">
            <span>المدفوع:</span>
            <strong>${invoice.paid.toFixed(0)} ${invCurrency}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:${remaining > 0 ? '#dc2626' : '#475569'};">
            <span>المتبقي:</span>
            <strong>${remaining.toFixed(0)} ${invCurrency}</strong>
          </div>
        </div>
      </div>

      <div style="margin-top:24px;padding-top:12px;border-top:1px dashed #cbd5e1;text-align:center;font-size:12px;color:#64748b;font-weight:600;">
        ${settings.receiptFooter || 'شكراً لتعاملكم معنا'}
      </div>
    </div>
  `;

  return renderHtmlToPdfFile(html, `فاتورة_${invoice.id}_${dateFormatted}.pdf`, options);
}

export async function exportReportToPdf(params: {
  reportTitle: string;
  reportDate: string;
  columns: string[];
  rows: (string | number)[][];
  summaryCards?: { label: string; value: string }[];
  supplierName?: string;
  supplierPhone?: string;
  settings: StoreSettings;
  options?: PdfExportOptions;
}): Promise<boolean> {
  const {
    reportTitle,
    reportDate,
    columns,
    rows,
    summaryCards = [],
    supplierName,
    supplierPhone,
    settings,
    options,
  } = params;

  const supplierBannerHtml = supplierName
    ? `<div style="display:flex;justify-content:space-between;background:#f8fafc;padding:12px 16px;border-radius:10px;border:1px solid #cbd5e1;margin-bottom:16px;font-size:14px;">
        <div>
          <span style="color:#64748b;font-weight:600;">موجه إلى المورد:</span>
          <strong style="color:#0f172a;margin-right:6px;">${supplierName}</strong>
        </div>
        ${
          supplierPhone
            ? `<div>
                <span style="color:#64748b;font-weight:600;">هاتف المورد:</span>
                <strong style="color:#0f172a;margin-right:6px;">${supplierPhone}</strong>
              </div>`
            : ''
        }
      </div>`
    : '';

  const summaryHtml =
    summaryCards.length > 0
      ? `<div style="display:grid;grid-template-columns:repeat(${Math.min(3, summaryCards.length)}, 1fr);gap:12px;margin-bottom:18px;">
          ${summaryCards
            .map(
              (c) => `
            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;">
              <div style="font-size:12px;color:#64748b;font-weight:600;">${c.label}</div>
              <div style="font-size:17px;font-weight:800;color:#1e4663;margin-top:4px;">${c.value}</div>
            </div>`
            )
            .join('')}
        </div>`
      : '';

  const headersHtml = columns
    .map((col, idx) => {
      if (col === '#') {
        return `<th style="width:55px;text-align:center;">${col}</th>`;
      }
      if (col === 'العدد المطلوب' || idx === columns.length - 1) {
        return `<th style="text-align:center;">${col}</th>`;
      }
      return `<th>${col}</th>`;
    })
    .join('');
  const bodyHtml =
    rows.length > 0
      ? rows
          .map(
            (r) =>
              `<tr>${r
                .map((cell, i) => {
                  const isIndexCol = columns[i] === '#';
                  const isLastCol = i === r.length - 1;
                  const align = isIndexCol || isLastCol ? 'center' : 'right';
                  return `<td style="text-align:${align};font-weight:${
                    i === 0 || isLastCol ? '700' : '600'
                  };${isIndexCol ? 'width:55px;color:#475569;' : ''}">${cell}</td>`;
                })
                .join('')}</tr>`
          )
          .join('')
      : `<tr><td colspan="${columns.length}" style="text-align:center;padding:20px;color:#64748b;">لا توجد بيانات مسجلة في هذا التقرير</td></tr>`;

  const html = `
    <div style="border:2px solid #1e4663;border-radius:14px;padding:24px;background:#ffffff;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:16px;margin-bottom:18px;">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#1e4663;">${settings.storeName || 'Cashier'}</h1>
          ${settings.phone ? `<p style="font-size:13px;color:#475569;margin-top:2px;">هاتف: ${settings.phone}</p>` : ''}
          ${settings.address ? `<p style="font-size:12px;color:#64748b;">${settings.address}</p>` : ''}
        </div>
        <div style="text-align:left;background:#f1f5f9;padding:10px 16px;border-radius:10px;border:1px solid #cbd5e1;">
          <div style="font-size:16px;font-weight:800;color:#1e4663;">${reportTitle}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">تاريخ التقرير: ${reportDate}</div>
        </div>
      </div>

      ${supplierBannerHtml}
      ${summaryHtml}

      <table>
        <thead>
          <tr>${headersHtml}</tr>
        </thead>
        <tbody>
          ${bodyHtml}
        </tbody>
      </table>

      <div style="margin-top:22px;padding-top:10px;border-top:1px dashed #cbd5e1;display:flex;justify-content:space-between;font-size:11px;color:#64748b;">
        <span>تم استخراج التقرير بصيغة PDF من تطبيق ${settings.storeName || 'Cashier'}</span>
        <span>عدد الأصناف / السجلات: ${rows.length}</span>
      </div>
    </div>
  `;

  const safeTitle = reportTitle.replace(/\s+/g, '_');
  return renderHtmlToPdfFile(html, `${safeTitle}_${reportDate}.pdf`, options);
}
