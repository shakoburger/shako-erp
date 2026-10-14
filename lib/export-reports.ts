export type ReportData = {
  title: string;
  logoUrl?: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  notes?: string[];
  orientation?: 'portrait' | 'landscape';
  amountColumns?: number[];
  sections?: { title: string; items: { label: string; value: string | number }[] }[];
  opening?: { label: string; value: number };
  totals?: (string | number)[];
  closing?: { label: string; value: number };
};

const formatCell = (data: ReportData, value: string | number, column: number) =>
  typeof value === 'number' && data.amountColumns?.includes(column)
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value ?? '');

const filename = (title: string) => title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100);

const escape = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const loadedScripts = new Map<string, Promise<void>>();

function loadScriptOnce(src: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (loadedScripts.has(src)) return loadedScripts.get(src)!;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).__loaded) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      (script as any).__loaded = true;
      resolve();
    };
    script.onerror = () => {
      loadedScripts.delete(src);
      reject(new Error(`Failed to load script ${src}`));
    };
    document.head.appendChild(script);
  });

  loadedScripts.set(src, promise);
  return promise;
}

async function getPdfEngines(): Promise<{ html2canvas: any; jsPDF: any }> {
  let html2canvas: any = null;
  let jsPDF: any = null;

  // 1. Check window global first
  if (typeof window !== 'undefined') {
    if ((window as any).html2canvas) html2canvas = (window as any).html2canvas;
    if ((window as any).jspdf?.jsPDF || (window as any).jsPDF) {
      jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
    }
  }

  // 2. Try standard dynamic import
  if (!html2canvas || !jsPDF) {
    try {
      const [hMod, jMod] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      if (!html2canvas) html2canvas = hMod?.default || hMod;
      if (!jsPDF) jsPDF = jMod?.jsPDF || (jMod as any)?.default?.jsPDF || (jMod as any)?.default || jMod;
    } catch (err) {
      console.warn('Standard dynamic import of PDF engines failed, falling back to script injection:', err);
    }
  }

  // 3. Fallback for html2canvas
  if (!html2canvas && typeof window !== 'undefined') {
    try {
      await loadScriptOnce('/node_modules/html2canvas/dist/html2canvas.min.js');
      html2canvas = (window as any).html2canvas;
    } catch {
      try {
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        html2canvas = (window as any).html2canvas;
      } catch (err) {
        console.error('All html2canvas loaders failed:', err);
      }
    }
  }

  // 4. Fallback for jsPDF
  if (!jsPDF && typeof window !== 'undefined') {
    try {
      await loadScriptOnce('/node_modules/jspdf/dist/jspdf.umd.min.js');
      jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
    } catch {
      try {
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
        jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
      } catch (err) {
        console.error('All jsPDF loaders failed:', err);
      }
    }
  }

  if (typeof html2canvas !== 'function' || typeof jsPDF !== 'function') {
    throw new Error('تعذر تحميل محرك PDF (يرجى استخدام زر الطباعة في حال تكرار المشكلة)');
  }

  return { html2canvas, jsPDF };
}

async function getExcelEngine(): Promise<any> {
  // 1. Check window
  if (typeof window !== 'undefined' && (window as any).ExcelJS?.Workbook) {
    return (window as any).ExcelJS;
  }

  // 2. Try standard import
  try {
    const mod = await import('exceljs');
    const engine = mod?.default || mod;
    if (engine?.Workbook) return engine;
  } catch (err) {
    console.warn('Standard import of ExcelJS failed, falling back to script injection:', err);
  }

  // 3. Fallback via local script or CDN
  if (typeof window !== 'undefined') {
    try {
      await loadScriptOnce('/node_modules/exceljs/dist/exceljs.min.js');
      if ((window as any).ExcelJS?.Workbook) return (window as any).ExcelJS;
    } catch {
      try {
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
        if ((window as any).ExcelJS?.Workbook) return (window as any).ExcelJS;
      } catch (err) {
        console.error('All ExcelJS loaders failed:', err);
      }
    }
  }

  throw new Error('تعذر تحميل محرك Excel');
}

async function getDocxEngine(): Promise<any> {
  // 1. Try standard dynamic import
  try {
    const mod = await import('docx');
    if (mod?.Document && mod?.Packer) return mod;
  } catch (err) {
    console.warn('Standard import of docx failed, falling back to direct ESM:', err);
  }

  // 2. Fallback via local ESM direct import or CDN at runtime
  const dynamicImport = (url: string) => (new Function('u', 'return import(u)'))(url);
  try {
    const mod = await dynamicImport('/node_modules/docx/dist/index.mjs');
    if (mod?.Document && mod?.Packer) return mod;
  } catch {
    try {
      const mod = await dynamicImport('https://cdn.jsdelivr.net/npm/docx@8.5.0/dist/index.mjs');
      if (mod?.Document && mod?.Packer) return mod;
    } catch (err) {
      console.error('All docx loaders failed:', err);
    }
  }

  throw new Error('تعذر تحميل محرك Word (docx)');
}

function createBrandedLogoCanvas(companyName: string = 'SHAKO'): { bytes: Uint8Array; base64: string; width: number; height: number } | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background rounded box for emblem
    ctx.fillStyle = '#0f766e';
    ctx.beginPath();
    ctx.roundRect(6, 8, 84, 84, 18);
    ctx.fill();

    // Flight / travel symbol inside emblem
    ctx.strokeStyle = '#e6f4f1';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    // Stylish S-curve / flight path
    ctx.moveTo(68, 30);
    ctx.lineTo(38, 30);
    ctx.arc(38, 44, 14, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(58, 58);
    ctx.arc(58, 70, 12, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(26, 82);
    ctx.stroke();

    // Brand title text
    ctx.fillStyle = '#0f766e';
    ctx.font = 'bold 34px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText('SHAKO', 106, 52);

    // Brand subtitle text
    ctx.fillStyle = '#64748b';
    ctx.font = '700 13px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillText('TRAVEL & TOURISM', 108, 74);

    const base64 = canvas.toDataURL('image/png');
    const binStr = atob(base64.split(',')[1]);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return { bytes, base64, width: 150, height: 42 };
  } catch (err) {
    console.warn('Failed to generate branded fallback logo:', err);
    return null;
  }
}

async function reportLogo(data: ReportData): Promise<{ bytes: Uint8Array; base64: string; width: number; height: number } | null> {
  if (data.logoUrl) {
    try {
      const res = await fetch(data.logoUrl);
      if (res.ok) {
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Use standard Image decode
        const img = new Image();
        img.src = base64;
        await img.decode();
        const ratio = Math.min(180 / (img.width || 1), 75 / (img.height || 1));
        const width = Math.round((img.width || 180) * ratio);
        const height = Math.round((img.height || 75) * ratio);

        const bytes = new Uint8Array(await blob.arrayBuffer());
        return { bytes, base64, width, height };
      }
    } catch (err) {
      console.warn('Failed to load custom agency logo from logoUrl, falling back to brand logo:', err);
    }
  }

  // Fallback to official brand logo
  return createBrandedLogoCanvas(data.subtitle);
}

export interface ColumnMeta {
  widthPct: number;
  excelWidth: number;
  wordWidth: number;
  align: 'right' | 'center' | 'left';
  isNumeric: boolean;
  isDateOrRef: boolean;
  isDebit: boolean;
  isCredit: boolean;
  isBalance: boolean;
}

export function analyzeReportColumns(data: ReportData): ColumnMeta[] {
  const headers = data.headers || [];
  if (!headers.length) return [];

  const rawWeights: number[] = [];
  const metas: Omit<ColumnMeta, 'widthPct'>[] = [];

  headers.forEach((h, colIndex) => {
    const header = (h || '').trim();
    const isAmountCol = data.amountColumns?.includes(colIndex) || false;
    
    // Sample values from rows to inspect column nature
    const sampleVals = (data.rows || []).slice(0, 15).map((r) => r[colIndex]);
    const hasNumbers = sampleVals.some(
      (v) => typeof v === 'number' || (typeof v === 'string' && /^-?[\d,]+\.\d{2}$/.test(v.trim()))
    );

    const isDate =
      /تاريخ|date/i.test(header) ||
      (colIndex === 0 && sampleVals.some((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''))));
    const isRef = /إيصال|ايصال|مرجع|سند|voucher|ref|رقم|code|كود|#/i.test(header);
    const isRate = /r\.?o\.?e|سعر الصرف|rate/i.test(header);
    const isQty = /عدد|كمية|qty|quantity/i.test(header);
    const isCurr = /عملة|curr/i.test(header);
    const isDesc =
      /بيان|وصف|تفاصيل|ملاحظات|desc|detail/i.test(header) ||
      (!isDate && !isRef && colIndex === 2 && headers.length <= 8);
    const isAccountOrEntity =
      /حساب|عميل|مورد|الخطوط|اسم|account|customer|supplier|airline|name/i.test(header) && !isDesc;
    const isDebit = /مطالبات|مدين|debit/i.test(header);
    const isCredit = /سداد|دائن|credit/i.test(header);
    const isBalance = /رصيد|balance/i.test(header);
    const isMoney =
      isAmountCol ||
      isDebit ||
      isCredit ||
      isBalance ||
      /مبلغ|سعر|تكلفة|ضرائب|عمولة|خصم|أرباح|دخل|صافي|إجمالي/i.test(header);

    let weight = 1.0;
    let excelWidth = 16;
    let wordWidth = 15;
    let align: 'right' | 'center' | 'left' = 'right';

    if (isDesc) {
      weight = headers.length <= 4 ? 3.5 : headers.length <= 8 ? 3.8 : 2.6;
      excelWidth = 44;
      wordWidth = 35;
      align = 'right';
    } else if (isAccountOrEntity) {
      weight = headers.length <= 5 ? 2.5 : 2.0;
      excelWidth = 28;
      wordWidth = 24;
      align = 'right';
    } else if (isDate) {
      weight = 1.15;
      excelWidth = 14;
      wordWidth = 13;
      align = 'center';
    } else if (isRef) {
      weight = 1.05;
      excelWidth = 13;
      wordWidth = 12;
      align = 'center';
    } else if (isRate || isQty || isCurr) {
      weight = 0.75;
      excelWidth = 10;
      wordWidth = 9;
      align = 'center';
    } else if (isMoney || hasNumbers) {
      weight = 1.35;
      excelWidth = 17;
      wordWidth = 15;
      align = 'left';
    } else {
      weight = 1.2;
      excelWidth = 18;
      wordWidth = 16;
      align = 'right';
    }

    rawWeights.push(weight);
    metas.push({
      excelWidth,
      wordWidth,
      align,
      isNumeric: isMoney || hasNumbers,
      isDateOrRef: isDate || isRef || isRate || isQty || isCurr,
      isDebit,
      isCredit,
      isBalance,
    });
  });

  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);
  return metas.map((m, idx) => ({
    ...m,
    widthPct: Math.round((rawWeights[idx] / totalWeight) * 1000) / 10,
  }));
}

export async function excelBlob(data: ReportData) {
  const ExcelJS = await getExcelEngine();
  const book = new ExcelJS.Workbook();
  book.creator = 'SHAKO';
  const isLandscape = data.orientation ? data.orientation === 'landscape' : data.headers.length > 7;
  const sheet = book.addWorksheet('التقرير', {
    views: [{ rightToLeft: true, showGridLines: true }],
    pageSetup: { orientation: isLandscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const colMeta = analyzeReportColumns(data);
  colMeta.forEach((cm, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = cm.excelWidth;
  });

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  };

  const headerBorder = {
    top: { style: 'medium' as const, color: { argb: 'FF0F766E' } },
    left: { style: 'thin' as const, color: { argb: 'FF0D5F59' } },
    bottom: { style: 'medium' as const, color: { argb: 'FF0F766E' } },
    right: { style: 'thin' as const, color: { argb: 'FF0D5F59' } },
  };

  const totalBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF0F766E' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'double' as const, color: { argb: 'FF0F766E' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  };

  const logo = await reportLogo(data);
  if (logo) {
    sheet.addRow([]).height = 60;
    const id = book.addImage({ base64: logo.base64, extension: 'png' });
    sheet.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: logo.width, height: logo.height } });
  }

  // Title Row
  const titleRow = sheet.addRow([data.title]);
  titleRow.height = 30;
  titleRow.getCell(1).font = { bold: true, size: 16, name: 'Segoe UI', color: { argb: 'FF0F172A' } };

  // Subtitle Row
  if (data.subtitle) {
    const subRow = sheet.addRow([data.subtitle]);
    subRow.height = 20;
    subRow.getCell(1).font = { italic: true, size: 10.5, name: 'Segoe UI', color: { argb: 'FF64748B' } };
  }

  sheet.addRow([]);

  // Sections (Metadata Info Cards)
  for (const section of data.sections || []) {
    const sTitle = sheet.addRow([section.title]);
    sTitle.height = 24;
    sTitle.getCell(1).font = { bold: true, size: 11, name: 'Segoe UI', color: { argb: 'FF0F766E' } };
    sTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };

    for (const item of section.items) {
      const sItem = sheet.addRow([item.label, item.value]);
      sItem.height = 20;
      sItem.getCell(1).font = { bold: true, size: 10, name: 'Segoe UI', color: { argb: 'FF475569' } };
      sItem.getCell(2).font = { size: 10, name: 'Segoe UI', color: { argb: 'FF0F172A' } };
      sItem.getCell(1).border = thinBorder;
      sItem.getCell(2).border = thinBorder;
    }
    sheet.addRow([]);
  }

  // Opening Balance Banner
  if (data.opening) {
    const openRow = sheet.addRow([data.opening.label, data.opening.value]);
    openRow.height = 25;
    openRow.getCell(1).font = { bold: true, size: 11, name: 'Segoe UI', color: { argb: 'FF166534' } };
    openRow.getCell(2).font = { bold: true, size: 11, name: 'Segoe UI', color: { argb: 'FF166534' } };
    openRow.getCell(2).numFmt = '#,##0.00';
    openRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
    openRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
    openRow.getCell(1).border = thinBorder;
    openRow.getCell(2).border = thinBorder;
    sheet.addRow([]);
  }

  // Table Header Row
  const header = sheet.addRow(data.headers);
  header.height = 30;
  header.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
    const cm = colMeta[colNumber - 1];
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.border = headerBorder;
    cell.alignment = {
      vertical: 'middle',
      horizontal: cm?.align || 'center',
      wrapText: true,
    };
  });

  // Data Rows
  (data.rows || []).forEach((rowValues, rowIdx) => {
    const row = sheet.addRow(rowValues);
    row.height = 23;
    const isEven = rowIdx % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
      const cm = colMeta[colNumber - 1];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.border = thinBorder;

      if (cm?.isNumeric && (typeof cell.value === 'number' || (typeof cell.value === 'string' && /^-?[\d,]+\.\d{2}$/.test(cell.value)))) {
        if (typeof cell.value === 'string') {
          cell.value = Number(cell.value.replaceAll(',', ''));
        }
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'left' };

        if (cm.isDebit) {
          cell.font = { size: 10.5, name: 'Segoe UI', color: { argb: 'FF1D4ED8' }, bold: true };
        } else if (cm.isCredit) {
          cell.font = { size: 10.5, name: 'Segoe UI', color: { argb: 'FF15803D' }, bold: true };
        } else if (cm.isBalance) {
          cell.font = { size: 10.5, name: 'Segoe UI', color: { argb: 'FF0F172A' }, bold: true };
        } else {
          cell.font = { size: 10.5, name: 'Segoe UI', color: { argb: 'FF1E293B' } };
        }
      } else {
        cell.font = { size: 10.5, name: 'Segoe UI', color: { argb: 'FF1E293B' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: cm?.align || 'right',
          wrapText: cm?.align === 'right',
        };
      }
    });
  });

  // Totals Row
  if (data.totals) {
    const totalRow = sheet.addRow(data.totals);
    totalRow.height = 26;
    totalRow.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
      const cm = colMeta[colNumber - 1];
      cell.font = { bold: true, size: 11, name: 'Segoe UI', color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4F1' } };
      cell.border = totalBorder;

      if (typeof cell.value === 'number' || (typeof cell.value === 'string' && /^-?[\d,]+\.\d{2}$/.test(cell.value))) {
        if (typeof cell.value === 'string') {
          cell.value = Number(cell.value.replaceAll(',', ''));
        }
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: cm?.align || 'right' };
      }
    });
  }

  // Closing Balance Banner
  if (data.closing) {
    sheet.addRow([]);
    const closeRow = sheet.addRow([data.closing.label, data.closing.value]);
    closeRow.height = 26;
    closeRow.getCell(1).font = { bold: true, size: 11.5, name: 'Segoe UI', color: { argb: 'FFFFFFFF' } };
    closeRow.getCell(2).font = { bold: true, size: 11.5, name: 'Segoe UI', color: { argb: 'FFFFFFFF' } };
    closeRow.getCell(2).numFmt = '#,##0.00';
    closeRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    closeRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    closeRow.getCell(1).border = thinBorder;
    closeRow.getCell(2).border = thinBorder;
  }

  sheet.addRow([]);
  for (const note of data.notes || []) {
    const noteRow = sheet.addRow([note]);
    noteRow.getCell(1).font = { italic: true, size: 10, name: 'Segoe UI', color: { argb: 'FF64748B' } };
  }

  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function wordBlob(data: ReportData) {
  const d = await getDocxEngine();
  const colMeta = analyzeReportColumns(data);
  const paragraph = (value: string | number, bold = false, align: 'right' | 'center' | 'left' = 'right') =>
    new d.Paragraph({
      bidirectional: true,
      alignment: align === 'center' ? d.AlignmentType.CENTER : align === 'left' ? d.AlignmentType.LEFT : d.AlignmentType.RIGHT,
      children: [new d.TextRun({ text: String(value ?? ''), bold, font: 'Segoe UI', size: 21, rightToLeft: true })],
    });

  const table = new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    visuallyRightToLeft: true,
    rows: [
      new d.TableRow({
        tableHeader: true,
        children: data.headers.map((h, i) =>
          new d.TableCell({
            shading: { fill: '0F766E' },
            width: { size: colMeta[i]?.wordWidth || 15, type: d.WidthType.PERCENTAGE },
            children: [
              new d.Paragraph({
                alignment: colMeta[i]?.align === 'center' ? d.AlignmentType.CENTER : colMeta[i]?.align === 'left' ? d.AlignmentType.LEFT : d.AlignmentType.RIGHT,
                children: [new d.TextRun({ text: h, bold: true, color: 'FFFFFF', font: 'Segoe UI', size: 21, rightToLeft: true })],
              }),
            ],
          })
        ),
      }),
      ...(data.rows || []).map(
        (row, rowIdx) =>
          new d.TableRow({
            children: row.map((v, i) =>
              new d.TableCell({
                shading: { fill: rowIdx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' },
                width: { size: colMeta[i]?.wordWidth || 15, type: d.WidthType.PERCENTAGE },
                children: [paragraph(formatCell(data, v, i), false, colMeta[i]?.align || 'right')],
              })
            ),
          })
      ),
      ...(data.totals
        ? [
            new d.TableRow({
              children: data.totals.map((v, i) =>
                new d.TableCell({
                  shading: { fill: 'E6F4F1' },
                  width: { size: colMeta[i]?.wordWidth || 15, type: d.WidthType.PERCENTAGE },
                  children: [paragraph(formatCell(data, v, i), true, colMeta[i]?.align || 'right')],
                })
              ),
            }),
          ]
        : []),
    ],
  });

  const logo = await reportLogo(data);
  const landscape = data.orientation ? data.orientation === 'landscape' : data.headers.length > 6;
  const doc = new d.Document({
    sections: [
      {
        properties: {
          page: {
            ...(landscape ? { size: { orientation: d.PageOrientation.LANDSCAPE, width: 16838, height: 11906 } } : {}),
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          ...(logo
            ? [
                new d.Paragraph({
                  children: [new d.ImageRun({ type: 'png', data: logo.bytes, transformation: { width: logo.width, height: logo.height } })],
                }),
              ]
            : []),
          paragraph(data.title, true, 'right'),
          paragraph(data.subtitle || '', false, 'right'),
          ...(data.sections || []).flatMap((s) => [
            paragraph(s.title, true, 'right'),
            ...s.items.map((item) => paragraph(item.label + ' : ' + item.value, false, 'right')),
          ]),
          ...(data.opening ? [paragraph(data.opening.label + ' : ' + Number(data.opening.value || 0).toFixed(2), true, 'right')] : []),
          table,
          ...(data.closing ? [paragraph(data.closing.label + ' : ' + Number(data.closing.value || 0).toFixed(2), true, 'right')] : []),
          ...(data.notes || []).map((n) => paragraph(n, false, 'right')),
        ],
      },
    ],
  });

  return d.Packer.toBlob(doc);
}

export async function pdfBlob(data: ReportData) {
  const { html2canvas, jsPDF } = await getPdfEngines();
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  const isLandscape = data.orientation ? data.orientation === 'landscape' : data.headers.length > 6;
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const logo = await reportLogo(data);
  const colMeta = analyzeReportColumns(data);

  // Pagination row capacity per page
  const rowsPerPageFirst = isLandscape ? 12 : 16;
  const rowsPerPageNext = isLandscape ? 18 : 24;

  const chunks: (string | number)[][][] = [];
  const allRows = data.rows || [];
  if (allRows.length <= rowsPerPageFirst) {
    chunks.push(allRows);
  } else {
    chunks.push(allRows.slice(0, rowsPerPageFirst));
    let start = rowsPerPageFirst;
    while (start < allRows.length) {
      chunks.push(allRows.slice(start, start + rowsPerPageNext));
      start += rowsPerPageNext;
    }
  }

  const containerWidth = isLandscape ? 1250 : 1020;

  for (let i = 0; i < chunks.length; i++) {
    const isFirstPage = i === 0;
    const isLastPage = i === chunks.length - 1;
    const page = document.createElement('div');
    page.dir = 'rtl';
    page.style.cssText = `position:fixed;left:-10000px;top:0;background:#ffffff;color:#0f172a;font:13px/1.6 "Cairo","Segoe UI",Tahoma,Arial,sans-serif;letter-spacing:normal;width:${containerWidth}px;padding:26px 30px;box-sizing:border-box;z-index:-1;`;

    // 1. Header (Full on page 1, compact continuation on subsequent pages)
    let headerHtml = '';
    if (isFirstPage) {
      headerHtml = `
        <style>
          * { letter-spacing: normal !important; word-spacing: normal !important; }
          h1, h2, h3, p, span, b, strong, td, th { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif !important; letter-spacing: normal !important; }
        </style>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:2px solid #0f766e;padding-bottom:14px;">
          <div>
            <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 6px 0;line-height:1.4;letter-spacing:normal;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;">${escape(data.title)}</h1>
            <p style="font-size:12px;color:#64748b;margin:0;letter-spacing:normal;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;">${escape(data.subtitle || '')}</p>
          </div>
          ${logo ? `<img alt="شعار الوكالة" src="${logo.base64}" style="width:${logo.width}px;height:${logo.height}px;object-fit:contain;" />` : ''}
        </div>
        ${
          (data.sections || []).length
            ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
                ${data.sections!
                  .map(
                    (s) => `
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                      <div style="background:#f1f5f9;color:#1e293b;font-size:12px;font-weight:700;padding:7px 12px;border-bottom:1px solid #e2e8f0;letter-spacing:normal;">${escape(s.title)}</div>
                      <div style="padding:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:11.5px;letter-spacing:normal;">
                        ${s.items
                          .map(
                            (item) => `
                            <div>
                              <span style="color:#64748b;">${escape(item.label)}: </span>
                              <b style="color:#0f172a;">${escape(item.value)}</b>
                            </div>`
                          )
                          .join('')}
                      </div>
                    </div>`
                  )
                  .join('')}
              </div>`
            : ''
        }
        ${
          data.opening
            ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;padding:9px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
                <b style="color:#166534;font-size:12.5px;letter-spacing:normal;">${escape(data.opening.label)}</b>
                <b dir="ltr" style="color:#15803d;font-size:14px;font-family:'Segoe UI',monospace;">${Number(data.opening.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>`
            : ''
        }
      `;
    } else {
      headerHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid #cbd5e1;padding-bottom:8px;">
          <div>
            <b style="font-size:15px;color:#0f172a;letter-spacing:normal;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;">${escape(data.title)} <span style="font-size:12px;font-weight:400;color:#64748b;">(تابع)</span></b>
          </div>
          <span style="font-size:11.5px;color:#64748b;">صفحة ${i + 1} من ${chunks.length}</span>
        </div>
      `;
    }

    // 2. Table HTML
    const tableHeaderHtml = `
      <thead>
        <tr style="background:#0f766e;color:#ffffff;">
          ${data.headers
            .map(
              (h, j) => `
            <th style="width:${colMeta[j]?.widthPct || 14}%;padding:10px 8px;font-size:12px;font-weight:700;text-align:${colMeta[j]?.align || 'right'};color:#ffffff;border:none;white-space:nowrap;">
              ${escape(h)}
            </th>`
            )
            .join('')}
        </tr>
      </thead>
    `;

    const tableRowsHtml = (chunks[i] || [])
      .map((row, rowIdx) => {
        const bg = rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `
          <tr style="background:${bg};">
            ${row
              .map((v, j) => {
                const cm = colMeta[j];
                const formatted = formatCell(data, v, j);
                let cellColor = '#1e293b';
                let cellWeight = '400';
                let fontFam = 'inherit';

                if (cm?.isNumeric && typeof v === 'number') {
                  fontFam = "'Segoe UI',Tahoma,monospace,sans-serif";
                  cellWeight = '600';
                  if (cm.isDebit) cellColor = '#1d4ed8';
                  else if (cm.isCredit) cellColor = '#15803d';
                  else if (cm.isBalance) {
                    cellColor = '#0f172a';
                    cellWeight = '700';
                  }
                } else if (cm?.isDateOrRef) {
                  cellColor = '#475569';
                  fontFam = 'monospace,sans-serif';
                }

                return `
                  <td style="padding:8px 8px;font-size:11.5px;border-bottom:1px solid #e2e8f0;border-left:1px solid #f1f5f9;text-align:${cm?.align || 'right'};color:${cellColor};font-weight:${cellWeight};font-family:${fontFam};overflow-wrap:break-word;word-break:break-word;line-height:1.4;">
                    ${escape(formatted)}
                  </td>`;
              })
              .join('')}
          </tr>`;
      })
      .join('');

    // Totals row (only on the last page)
    let totalsHtml = '';
    if (isLastPage && data.totals) {
      totalsHtml = `
        <tr style="background:#f1f5f9;border-top:2px solid #0f766e;border-bottom:2px solid #0f766e;">
          ${data.totals
            .map((v, j) => {
              const cm = colMeta[j];
              const formatted = formatCell(data, v, j);
              return `
                <td style="padding:10px 8px;font-size:12px;font-weight:700;color:#0f172a;text-align:${cm?.align || 'right'};border-top:2px solid #0f766e;border-bottom:2px solid #0f766e;white-space:nowrap;">
                  ${escape(formatted)}
                </td>`;
            })
            .join('')}
        </tr>`;
    }

    const tableHtml = `
      <table style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden;margin-bottom:14px;">
        ${tableHeaderHtml}
        <tbody>
          ${tableRowsHtml}
          ${totalsHtml}
        </tbody>
      </table>
    `;

    // 3. Footer / Closing Balance (on last page)
    let footerHtml = '';
    if (isLastPage) {
      footerHtml = `
        ${
          data.closing
            ? `<div style="background:#0f766e;color:#ffffff;border-radius:7px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <b style="font-size:13px;font-weight:700;">${escape(data.closing.label)}</b>
                <b dir="ltr" style="font-size:15px;font-weight:800;font-family:'Segoe UI',monospace;">${Number(data.closing.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>`
            : ''
        }
        ${(data.notes || [])
          .map((n) => `<p style="color:#64748b;font-size:11px;line-height:1.6;margin:6px 0;">${escape(n)}</p>`)
          .join('')}
      `;
    }

    // Page number bottom footer
    const pageFooterHtml = `
      <div style="border-top:1px dashed #cbd5e1;padding-top:8px;margin-top:12px;display:flex;justify-content:space-between;color:#94a3b8;font-size:10.5px;">
        <span>تم إنشاء التقرير عبر نظام SHAKO ERP</span>
        <span>صفحة ${i + 1} من ${chunks.length}</span>
      </div>
    `;

    page.innerHTML = `${headerHtml}${tableHtml}${footerHtml}${pageFooterHtml}`;
    document.body.appendChild(page);

    try {
      await Promise.all(Array.from(page.querySelectorAll('img')).map((img) => img.decode().catch(() => {})));
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });

      if (i > 0) pdf.addPage();
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pdfWidth - margin * 2;
      const usableHeight = pdfHeight - margin * 2;
      const imgHeight = (canvas.height * usableWidth) / canvas.width;

      // Fit gracefully without distortion
      if (imgHeight <= usableHeight) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', margin, margin, usableWidth, imgHeight);
      } else {
        const scaledWidth = (usableHeight * canvas.width) / canvas.height;
        const leftOffset = margin + (usableWidth - scaledWidth) / 2;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', leftOffset, margin, scaledWidth, usableHeight);
      }
    } finally {
      page.remove();
    }
  }

  return pdf.output('blob');
}

export async function exportReport(data: ReportData, format: 'pdf' | 'xlsx' | 'docx') {
  const blob = await (format === 'pdf' ? pdfBlob(data) : format === 'xlsx' ? excelBlob(data) : wordBlob(data));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename(data.title) + '.' + format;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function reportFromPaper(paper: HTMLElement): ReportData {
  const numeric = /مبلغ|رصيد|سداد|مطالبات|مدين|دائن|سعر الصرف|قبل|بعد|الحركة/;
  const headers = Array.from(paper.querySelectorAll('thead th')).map((n) => n.textContent?.trim() || '');
  const rows = Array.from(paper.querySelectorAll('tbody tr')).map((r) =>
    Array.from(r.querySelectorAll('td')).map((c, i) => {
      const v = c.textContent?.trim() || '';
      return numeric.test(headers[i] || '') && /^-?[\d,]+\.\d{2}$/.test(v) ? Number(v.replaceAll(',', '')) : v;
    })
  );
  const notes = Array.from(paper.querySelectorAll('p,.report-meta,.cash-receipt-meta,.cash-signatures,.report-totals'))
    .filter((n) => !n.parentElement?.closest('.cash-receipt-meta,.report-totals'))
    .map((n) => n.textContent?.trim() || '')
    .filter(Boolean);
  return {
    title: paper.querySelector('h1')?.textContent || 'تقرير SHAKO',
    subtitle: paper.querySelector('h2')?.textContent || '',
    headers,
    rows,
    notes,
  };
}
