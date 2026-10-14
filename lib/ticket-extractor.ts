/**
 * Advanced Ticket & Multi-Passenger OCR & Document Parser
 * Supports: PDFs (via pdfjs-dist), Images (via tesseract.js), Text/GDS/PNR files.
 */

export type ExtractedPassenger = {
  name: string;
  ticketNo: string;
  fare?: number;
  total?: number;
};

export type ExtractedTicketData = {
  passengers: ExtractedPassenger[];
  passenger: string;
  ticketNo: string;
  allPassengers: string[];
  allTicketNos: string[];
  pnr?: string;
  route?: string;
  class?: string;
  currency?: string;
  fare?: number;
  total?: number;
  airline?: string;
  customerName?: string;
  date?: string;
  taxes?: Record<string, number>;
  rawText?: string;
  referenceCode?: string;
  financialDirection?: 'deposit' | 'withdraw';
  financialChannel?: 'bank' | 'cash';
  financialNotes?: string;
};

// Normalize Arabic-Indic numerals (٠-٩) and Persian numerals (۰-۹) to ASCII 0-9
export function normalizeArabicDigits(raw: string): string {
  if (!raw) return '';
  const arabicIndic = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  const easternPersian = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  let res = raw;
  for (let i = 0; i < 10; i++) {
    res = res.replace(new RegExp(arabicIndic[i], 'g'), String(i));
    res = res.replace(new RegExp(easternPersian[i], 'g'), String(i));
  }
  return res;
}

// Normalize text for parsing
export function cleanText(raw: string): string {
  if (!raw) return '';
  return normalizeArabicDigits(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ');
}

// Airline ticket 3-digit prefixes
export const AIRLINE_PREFIX_MAP: Record<string, string> = {
  '524': 'TARCO AVIATION',
  '247': 'BADR AIRLINES',
  '367': 'BADR AIRLINES',
  '157': 'QATAR AIRWAYS',
  '077': 'EGYPTAIR',
  '065': 'SAUDIA',
  '141': 'FLYDUBAI',
  '176': 'EMIRATES',
  '144': 'AIR CAIRO',
  '411': 'FLYNAS',
  '786': 'JAZEERA AIRWAYS',
  '071': 'ETHIOPIAN AIRLINES',
  '074': 'KLM',
  '220': 'LUFTHANSA',
  '232': 'MALAYSIA AIRLINES',
  '235': 'TURKISH AIRLINES',
  '273': 'SALAMAIR',
  '200': 'SUDAN AIRWAYS',
  '069': 'SUDAN AIRWAYS',
  '514': 'AIRARABIA'
};

// 2-Letter IATA airline flight code prefixes
export const AIRLINE_IATA_MAP: Record<string, string> = {
  '3T': 'TARCO AVIATION',
  'J4': 'BADR AIRLINES',
  'QR': 'QATAR AIRWAYS',
  'MS': 'EGYPTAIR',
  'SV': 'SAUDIA',
  'FZ': 'FLYDUBAI',
  'EK': 'EMIRATES',
  'SM': 'AIR CAIRO',
  'XY': 'FLYNAS',
  'J9': 'JAZEERA AIRWAYS',
  'ET': 'ETHIOPIAN AIRLINES',
  'TK': 'TURKISH AIRLINES',
  'OV': 'SALAMAIR',
  'SD': 'SUDAN AIRWAYS',
  'G9': 'AIRARABIA'
};

// Common city to airport IATA codes
export const CITY_AIRPORT_MAP: Record<string, string> = {
  'KUALA LUMPUR': 'KUL',
  'DOHA': 'DOH',
  'PORT SUDAN': 'PZU',
  'CAIRO': 'CAI',
  'KHARTOUM': 'KRT',
  'DUBAI': 'DXB',
  'JEDDAH': 'JED',
  'RIYADH': 'RUH',
  'ISTANBUL': 'IST',
  'ADDIS ABABA': 'ADD',
  'MUSCAT': 'MCT',
  'KUWAIT': 'KWI',
  'BAHRAIN': 'BAH',
  'DAMMAM': 'DMM',
  'SHARJAH': 'SHJ',
  'ABU DHABI': 'AUH'
};

export function isNoticeOrTermsPage(text: string): boolean {
  if (!text) return false;
  const clean = cleanText(text);
  const hasTicketTable = /(?:Passenger\s*Name\s+Ticket\s*Number|Travel\s*Itinerary|Payment\s*Receipt|E-TICKET\s*RECEIPT|ELECTRONIC\s*TICKET\s*PASSENGER\s*ITINERARY|بيانات\s*التذكرة|إيصال\s*التذكرة)/i.test(clean);
  if (hasTicketTable) return false;

  const noticeKeywords = /(?:General\s*Conditions\s*of\s*Carriage|Conditions\s*of\s*Contract|تنبيهات\s*هامة|الشروط\s*العامة\s*للنقل|شروط\s*العقد|مواد\s*ممنوع\s*حملها|Items\s*prohibited|Checked\s*Baggage|Dangerous\s*Goods|موانع\s*السفر|إشعار\s*قانوني|Legal\s*Notice)/i;
  return noticeKeywords.test(clean);
}

const INVALID_PAX_PATTERN = /(?:ticket\s*number|dangerous\s*goods|information|service\s*request|baggage|allowance|fare\s*basis|contact|passport|terminal|departure|arrival|status|currency|excess\s*bag|hand\s*baggage|booking\s*ref|payment\s*mode|place\s*of\s*issue|ticket\s*issued|electronic\s*ticket|flight\s*itinerary|itinerary\s*receipt|passenger\s*itinerary|passenger\s*receipt|passenger\s*coupon|itinerary|receipt|coupon|e-?ticket|eticket|fare\s*details|fare\s*rules|total\s*amount|base\s*fare|tax\s*&|taxes|surcharges|non\s*stop|equipment|duration|flight\s*booking|operated\s*by|travel\s*emission|emission|agrees?|rules?|conditions?|applicable|accepting|carriage|general\s*conditions|airlines?|aviation|airways|boarding\s*pass|change\s*fees|refund\s*fees|validity|penalty|no\s*show|additional\s*penalty|please\s*note|free\s*exchanges|trip\s*segment|passenger\s*type|adult\(s\)|child|infant|رقم\s*التذكرة|رقم\s*التذكره|التذكرة|التذكره|تذكرة\s*رقم|تذكرة|تذكره|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*التذكرة|تاريخ\s*المعاملة|تاريخ\s*التحويل|تاريخ\s*العملية|رقم\s*الحجز|مرجع\s*الحجز|الرقم\s*المرجعي|رقم\s*العملية|اسم\s*العميل|اسم\s*الراكب|اسم\s*المسافر|بيانات\s*الراكب|المبلغ|الخطوط|شركة\s*الطيران|تنبيهات\s*هامة|الشروط\s*العامة|شروط\s*النقل|شروط\s*العقد|المعمول\s*بها|جميع\s*القواعد|المستندات\s*الرسمية|الرسمية\s*والصحية)/i;

const RESERVED_WORDS = new Set([
  'USD', 'SDG', 'SAR', 'AED', 'EGP', 'EUR', 'GBP', 'QAR', 'KWD', 'OMR', 'BHD',
  'BAGGAGE', 'ALLOWANCE', 'TICKET', 'FLIGHT', 'STATUS', 'TERMINAL', 'CABIN',
  'ECONOMY', 'BUSINESS', 'FIRST', 'ADULT', 'ADULTS', 'CHILD', 'INFANT', 'TOTAL', 'FARE',
  'CHECK-IN', 'CHECKIN', 'DEPARTURE', 'ARRIVAL', 'ROUTE', 'CLASS', 'SECTOR', 'BOOKING', 'REF',
  'ITINERARY', 'RECEIPT', 'PASSENGER', 'PASSENGERS', 'COUPON', 'E-TICKET', 'ETICKET', 'AGENCY', 'AIRLINES', 'AIRLINE',
  'TYPE', 'MUST', 'CONTACT', 'PASSPORT', 'NUMBER', 'VALID', 'VALIDITY', 'CHANGES', 'FEES', 'FREE', 'EXCHANGE', 'SEGMENT', 'BASIS',
  'INFORMATION', 'HOURS', 'BEFORE', 'AFTER', 'CHECKED', 'WEIGHT', 'KG', 'ITEMS', 'PROHIBITED', 'BOARDING', 'GATE',
  'NOT', 'PLEASE', 'NOTE', 'IS', 'A', 'PER', 'TRIP', 'SEAT', 'RULES', 'TERMS', 'CONDITIONS', 'AGREES', 'CARRIAGE',
  // Airport codes
  'PZU', 'KRT', 'CAI', 'DXB', 'JED', 'RUH', 'DOH', 'KUL', 'IST', 'ADD', 'MCT', 'KWI', 'BAH', 'DMM', 'SHJ', 'AUH', 'OK',
  // Arabic stop words and legal terms
  'التذكرة', 'التذكره', 'تذكرة', 'تذكره', 'المسافر', 'الراكب', 'العميل', 'المورد', 'الخطوط', 'الحجز', 'الإصدار', 'الاصدار',
  'علي', 'على', 'في', 'من', 'إلى', 'الي', 'عن', 'مع', 'كل', 'جميع', 'يجب', 'قبل', 'بعد', 'عند', 'حسب',
  'أو', 'او', 'لا', 'ما', 'لم', 'لن', 'بأن', 'بان', 'أن', 'ان', 'تم', 'تمت', 'تنبيهات', 'شروط', 'الشروط',
  'قواعد', 'القواعد', 'احضار', 'إحضار', 'المعمول', 'ممنوع', 'المستندات', 'الرسمية', 'الصحية', 'ساعات', 'الإجراءات', 'الاجراءات',
  'المسافرين', 'هامة', 'العامة', 'للنقل', 'خاصة', 'بالخطوط'
]);

export function isValidPaxName(raw: string): boolean {
  if (!raw) return false;
  const cleaned = raw.trim();
  if (cleaned.length < 3 || cleaned.length > 50) return false;
  if (INVALID_PAX_PATTERN.test(cleaned)) return false;
  const upper = cleaned.toUpperCase().replace(/\s+/g, ' ');
  if (RESERVED_WORDS.has(upper)) return false;

  const words = upper.split(/\s+/);
  // Real passenger names should not have more than 4 words
  if (words.length > 4) return false;
  // If all words are reserved words or any word is an invalid stop word
  if (words.every(w => RESERVED_WORDS.has(w))) return false;
  const criticalStopWords = new Set([
    'TYPE', 'MUST', 'CONTACT', 'PASSPORT', 'NUMBER', 'VALID', 'FEES', 'RULES', 'NOTE',
    'علي', 'على', 'في', 'من', 'كل', 'جميع', 'يجب', 'شروط', 'قواعد', 'احضار', 'المعمول', 'المستندات'
  ]);
  for (const w of words) {
    if (criticalStopWords.has(w)) {
      return false;
    }
  }

  // Must contain alphabetic characters
  if (!/[A-Za-z\u0600-\u06FF]/.test(cleaned)) return false;

  // Single word names must have at least 4 letters and not match single-word generic tokens
  if (words.length === 1 && (cleaned.length < 4 || RESERVED_WORDS.has(upper))) return false;

  return true;
}

// Format passenger names (e.g. "MOHAMMED/ALI MR" -> "MOHAMMED ALI")
export function formatPaxName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\b(MR|MRS|MS|MSTR|MISS|CHD|INF|DR|PROF)\b/gi, '')
    .replace(/[\/\\–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean ticket numbers (keep 10-14 digits)
export function formatTicketNo(no: string): string {
  if (!no) return '';
  const digits = no.replace(/\D/g, '');
  return digits;
}

export function extractDateFromSubstr(sub: string): string {
  if (!sub) return '';
  const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const arMonths: Record<string, string> = { 'يناير': '01', 'فبراير': '02', 'مارس': '03', 'ابريل': '04', 'أبريل': '04', 'مايو': '05', 'يونيو': '06', 'يوليو': '07', 'اغسطس': '08', 'أغسطس': '08', 'سبتمبر': '09', 'اكتوبر': '10', 'أكتوبر': '10', 'نوفمبر': '11', 'ديسمبر': '12' };

  // 0. Arabic month name: 12 أكتوبر 2026 or 12 اكتوبر 2026
  const arMonthMatch = sub.match(/(?:^|\s)([0-3]?\d)\s+(يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s+(202\d|\d{2})(?:$|\s|[^\u0600-\u06FFA-Za-z0-9])/i);
  if (arMonthMatch) {
    const d = arMonthMatch[1].padStart(2, '0');
    const m = arMonths[arMonthMatch[2]];
    const y = arMonthMatch[3].length === 2 ? '20' + arMonthMatch[3] : arMonthMatch[3];
    return `${y}-${m}-${d}`;
  }

  // 1. Airline compact/space/dash date: 12OCT26, 12OCT2026, 12-OCT-2026, 12 OCT 2026, 12 Oct 26
  const compactMatch = sub.match(/\b([0-3]?\d)\s*[\/\.-]?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*[\/\.-]?\s*(\d{2,4})\b/i);
  if (compactMatch) {
    const d = compactMatch[1].padStart(2, '0');
    const m = months[compactMatch[2].toLowerCase()];
    const y = compactMatch[3].length === 2 ? '20' + compactMatch[3] : compactMatch[3];
    return `${y}-${m}-${d}`;
  }

  // 2. Full English month name: 03 OCTOBER 2026
  const fullMonth = sub.match(/\b([0-3]?\d)\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(202\d)\b/i);
  if (fullMonth) {
    const d = fullMonth[1].padStart(2, '0');
    const m = months[fullMonth[2].slice(0, 3).toLowerCase()];
    return `${fullMonth[3]}-${m}-${d}`;
  }

  // 3. Slash / Dash / Dot date: 12/10/2026, 12-10-2026, 12.10.2026, 12/10/26
  const slashDate = sub.match(/\b([0-3]?\d)[\/\.-]([01]?\d)[\/\.-](202\d|\d{2})\b/);
  if (slashDate) {
    const d = slashDate[1].padStart(2, '0');
    const m = slashDate[2].padStart(2, '0');
    const y = slashDate[3].length === 2 ? '20' + slashDate[3] : slashDate[3];
    return `${y}-${m}-${d}`;
  }

  // 4. ISO date: 2026-10-12, 2026/10/12, 2026.10.12
  const iso = sub.match(/\b(202\d)[\/\.-]([01]\d)[\/\.-]([0-3]\d)\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return '';
}

export function parseTicketDate(text: string): string {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Label patterns for ticket issue date AND financial transaction date
  const dateLabelRegex = /(?:DATE\s*OF\s*ISSUE|DATE\s*OF\s*ISSUANCE|ISSUE\s*DATE|ISSUED\s*ON|ISSUED|ISS\.DATE|DOI|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*إصدار\s*التذكرة|تاريخ\s*التذكرة|تاريخ\s*الحجز|BOOKING\s*DATE|تاريخ\s*المعاملة|تاريخ\s*المعامله|تاريخ\s*التحويل|تاريخ\s*الحوالة|تاريخ\s*الحواله|تاريخ\s*الحوالات|تاريخ\s*العملية|تاريخ\s*العمليه|تاريخ\s*الحركة|تاريخ\s*الحركه|تاريخ\s*الإشعار|تاريخ\s*الاشعار|تاريخ\s*السند|تاريخ\s*الإيصال|تاريخ\s*الايصال|تاريخ\s*الدفع|تاريخ\s*السداد|تاريخ\s*الإيداع|تاريخ\s*الايداع|تاريخ\s*السحب|تاريخ\s*ووقت\s*المعاملة|تاريخ\s*ووقت\s*العملية|وقت\s*وتاريخ\s*المعاملة|وقت\s*وتاريخ\s*العملية|تاريخ\s*الطلب|POSTING\s*DATE|EXECUTION\s*DATE|TRANSACTION\s*DATE|TRANS\s*DATE|TXN\s*DATE|TRANSFER\s*DATE|PAYMENT\s*DATE|VALUE\s*DATE|DATE\/TIME|DATE\s*&\s*TIME|(?:^|\s)DATE\b|(?:^|\s)التاريخ(?=$|[\s:#\/\-–=]))/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (dateLabelRegex.test(line)) {
      // 1. Check remainder on same line
      const afterLabel = line.replace(dateLabelRegex, '').replace(/^[:\s#]+/, '').trim();
      const onSameLine = extractDateFromSubstr(afterLabel);
      if (onSameLine) return onSameLine;

      // 2. Check next line (multiline label layout)
      if (i + 1 < lines.length) {
        const onNextLine = extractDateFromSubstr(lines[i + 1]);
        if (onNextLine) return onNextLine;
      }
      if (i + 2 < lines.length) {
        const onLine2 = extractDateFromSubstr(lines[i + 2]);
        if (onLine2) return onLine2;
      }
    }
  }

  // Global scan across entire text lines if labeled match not found
  for (const line of lines) {
    const d = extractDateFromSubstr(line);
    if (d) return d;
  }

  return '';
}

/**
 * Parses raw text from a single page or whole document
 */
export function parseTicketTextContent(raw: string): ExtractedTicketData {
  const text = cleanText(raw);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const passengers: ExtractedPassenger[] = [];
  const foundTicketNos: string[] = [];
  const foundPaxNames: string[] = [];

  // --- 0. Multiline & Inline Labels Scanner (Pass 1: Detects labels on separate lines or same line) ---
  const paxLabelLineRegex = /^(?:\d+[\.\-\)]\s*|\*\s*|-+\s*)?(?:PASSENGER\s*NAME|NAME\s*OF\s*PASSENGER|PASSENGER\(S\)|PASSENGER|PAX\s*NAME|PAX|TRAVELLER|TRAVELER|NAME|اسم\s*الراكب|اسم\s*المسافر|الراكب|المسافر|بيانات\s*الراكب|بيانات\s*المسافر)(?=$|[\s:#\/\-–=])/i;
  const tktLabelLineRegex = /^(?:\d+[\.\-\)]\s*|\*\s*|-+\s*)?(?:TICKET\s*NUMBER|TKT\s*NO|ETKT\s*NO|E-TICKET\s*NUMBER|TICKET|ETKT|E-TICKET|رقم\s*التذكرة|رقم\s*التذكره|التذكرة|التذكره)(?=$|[\s:#\/\-–=])/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check passenger label (either on same line or next line)
    if (paxLabelLineRegex.test(line)) {
      const remainder = line.replace(paxLabelLineRegex, '').replace(/^[:#\/\s-]+/, '').trim();
      const rawCand = remainder.split(/(?:\s{2,}|\t|\b(?:TKT|ETKT|TICKET|TICKET\s*NO|TICKET\s*NUMBER|DATE|DOI|PNR|BOOKING|FLIGHT)\b|(?=[#|])|(?:^|\s)(?:رقم\s*التذكرة|تذكرة\s*رقم|رقم\s*التذكره|تذكره\s*رقم|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*المعاملة|تاريخ\s*المعامله))/i)[0].trim();
      if (isValidPaxName(rawCand)) {
        const name = formatPaxName(rawCand);
        if (name && !foundPaxNames.includes(name)) foundPaxNames.push(name);
      } else if (i + 1 < lines.length) {
        const nextCand = lines[i + 1].split(/(?:\s{2,}|\t|\b(?:TKT|ETKT|TICKET)\b|(?:^|\s)(?:رقم\s*التذكرة))/i)[0].trim();
        if (isValidPaxName(nextCand)) {
          const name = formatPaxName(nextCand);
          if (name && !foundPaxNames.includes(name)) foundPaxNames.push(name);
        }
      }
    }

    // Check ticket number label (either on same line or next line)
    if (tktLabelLineRegex.test(line)) {
      const remainder = line.replace(tktLabelLineRegex, '').replace(/^[:#\/\s-]+/, '').trim();
      const mMatch = remainder.match(/(?:\b|^)(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\d{10,14})(?:\b|$)/);
      if (mMatch) {
        const cleanDigits = mMatch[1].replace(/\D/g, '');
        if (cleanDigits.length >= 10 && cleanDigits.length <= 14 && !foundTicketNos.includes(cleanDigits)) {
          foundTicketNos.push(cleanDigits);
        }
      } else if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/(?:\b|^)(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\d{10,14})(?:\b|$)/);
        if (nextMatch) {
          const nextDigits = nextMatch[1].replace(/\D/g, '');
          if (nextDigits.length >= 10 && nextDigits.length <= 14 && !foundTicketNos.includes(nextDigits)) {
            foundTicketNos.push(nextDigits);
          }
        }
      }
    }
  }

  // Also check inline ticket numbers anywhere in the line
  for (const line of lines) {
    const inlineTkt = line.match(/(?:TKT|ETKT|TICKET|TKT\s*NO|TICKET\s*NUMBER|E-TICKET\s*NUMBER|رقم\s*التذكرة|رقم\s*التذكره|تذكرة\s*رقم|تذكره\s*رقم)[\s:#\-]*([0-9\s-]{10,22})/i);
    if (inlineTkt) {
      const clean = inlineTkt[1].replace(/\D/g, '');
      if (clean.length >= 10 && clean.length <= 14 && !foundTicketNos.includes(clean)) {
        foundTicketNos.push(clean);
      }
    }
  }

  // Global scan for any 13-14 digit ticket numbers (e.g. 367 2420 778012 or 367-2420778012)
  for (const line of lines) {
    const m = line.match(/\b(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\d{13,14})\b/);
    if (m) {
      const rawDigits = m[1].replace(/\D/g, '');
      if (rawDigits.length >= 13 && rawDigits.length <= 14 && !foundTicketNos.includes(rawDigits)) {
        foundTicketNos.push(rawDigits);
      }
    }
  }

  // --- 1. Find all Ticket Numbers (13-14 digits or 3-digit prefix + 10 digits) ---
  const tktRegex = /(?:TKT|ETKT|TICKET|TKT\s*NO|TICKET\s*NUMBER|E-TICKET\s*NUMBER|رقم\s*التذكرة|تذكرة\s*رقم|رقم\s*التذكره|تذكره\s*رقم)[\s:#-]*(\d[\d\s-]{9,18}\d)|\b(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\d{13,14})\b/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = tktRegex.exec(text)) !== null) {
    const cleanNo = (tMatch[1] || tMatch[2]).replace(/\D/g, '');
    if (cleanNo.length >= 13 && cleanNo.length <= 14 && !foundTicketNos.includes(cleanNo)) {
      foundTicketNos.push(cleanNo);
    }
  }

  // Also check line-by-line ticket patterns
  for (const line of lines) {
    const m = line.match(/\b(\d{3})[\s-](\d{4})[\s-](\d{6})\b/) || line.match(/\b(\d{3})[-\s](\d{10})\b/);
    if (m) {
      const full = m.slice(1).join('').replace(/\D/g, '');
      if (full.length >= 13 && full.length <= 14 && !foundTicketNos.includes(full)) {
        foundTicketNos.push(full);
      }
    }
  }

  // Support ticket ranges: e.g. 3672420768221-29 or 3672420768221 - 29
  const rangeRegex = /\b(\d{3}[-\s]?\d{10})[-\s/]+(\d{1,3})\b/g;
  let rMatch: RegExpExecArray | null;
  while ((rMatch = rangeRegex.exec(text)) !== null) {
    const startStr = rMatch[1].replace(/[-\s]/g, '');
    const endSuffix = rMatch[2];
    if (startStr.length >= 13) {
      const prefix = startStr.slice(0, startStr.length - endSuffix.length);
      const startNum = parseInt(startStr.slice(startStr.length - endSuffix.length), 10);
      const endNum = parseInt(endSuffix, 10);
      if (endNum > startNum && endNum - startNum <= 20) {
        for (let n = startNum; n <= endNum; n++) {
          const fullTkt = prefix + String(n).padStart(endSuffix.length, '0');
          if (!foundTicketNos.includes(fullTkt)) {
            foundTicketNos.push(fullTkt);
          }
        }
      }
    }
  }

  // --- 2. Paired Line Formats ---
  // Format A: "TICKET: QR/ETKT 157 4885787419 FOR OSMAN/MUHAMMAD MR"
  for (const line of lines) {
    const forMatch = line.match(/(?:TKT|ETKT|TICKET)[^0-9]*?(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[-\s]?\d{10}|\b\d{13,14}\b)\s+FOR\s+([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s\/]{2,35})/i);
    if (forMatch) {
      const tNo = forMatch[1].replace(/[-\s]/g, '');
      const rawName = forMatch[2];
      if (isValidPaxName(rawName)) {
        const name = formatPaxName(rawName);
        if (name && !passengers.some(p => p.ticketNo === tNo)) {
          passengers.push({ name, ticketNo: tNo });
          if (!foundPaxNames.includes(name)) foundPaxNames.push(name);
        }
      }
    }
  }

  // Format B: "Mr. MUHANAD ELTAYEB 5242419449891 Adult(s) +249912311156 P11209104" or with spaces "524 2419 449891"
  for (const line of lines) {
    const directMatch = line.match(/(?:(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Mstr\.?)\s+)?([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s]{2,30})\s+(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[-\s]?\d{10}|\b\d{13,14}\b)/i);
    if (directMatch) {
      const candidateName = directMatch[1];
      const tNo = directMatch[2].replace(/[-\s]/g, '');
      if (isValidPaxName(candidateName)) {
        const name = formatPaxName(candidateName);
        if (name && !passengers.some(p => p.ticketNo === tNo)) {
          passengers.push({ name, ticketNo: tNo });
          if (!foundPaxNames.includes(name)) foundPaxNames.push(name);
        }
      }
    }
  }

  // Format C: Standard GDS paired format: "SURNAME/GIVENNAME ... 2471234567890"
  for (const line of lines) {
    const paired = line.match(/([A-Z\u0600-\u06FF]{2,20}\/[A-Z\u0600-\u06FF\s]{2,25})\s+.*?(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[-\s]?\d{10}|\b\d{13,14}\b)/i);
    if (paired) {
      const candidateName = paired[1];
      const tNo = paired[2].replace(/[-\s]/g, '');
      if (isValidPaxName(candidateName)) {
        const name = formatPaxName(candidateName);
        if (name && !passengers.some(p => p.ticketNo === tNo)) {
          passengers.push({ name, ticketNo: tNo });
          if (!foundPaxNames.includes(name)) foundPaxNames.push(name);
        }
      }
    }
  }

  // Format D: Standard GDS numbered format: "1.1ALI/MOHAMMED MR" or "1. IBRAHIM/YOUSIF MR  2. IBRAHIM/MONA MRS"
  const gdsPaxRegex = /(?:^|\s)(?:\d+\.\d+|\d+[\.\-\)])\s*([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s\/\\–-]{2,35}?)(?=\s+\d+[\.\-\)]|\s+TKT|\s+ETKT|\s+\d{10}|$)/gi;
  for (const line of lines) {
    let m: RegExpExecArray | null;
    while ((m = gdsPaxRegex.exec(line)) !== null) {
      const rawName = m[1].split(/TKT|ETKT|TICKET|\d{10}/i)[0];
      if (isValidPaxName(rawName)) {
        const formatted = formatPaxName(rawName);
        if (formatted && !foundPaxNames.includes(formatted)) {
          foundPaxNames.push(formatted);
        }
      }
    }
  }

  // Format E: "PAX: NAME" or "PASSENGER NAME: NAME" or "المسافر: ..." or "الراكب: ..."
  const labelPaxRegex = /(?:^|\s|[^\u0600-\u06FFA-Za-z0-9])(?:PAX\s*NAME|PASSENGER\s*NAME|NAME\s*OF\s*PASSENGER|اسم\s*المسافر|اسم\s*الراكب|بيانات\s*الراكب|بيانات\s*المسافر|(?:PAX|PASSENGER|NAME|الراكب|المسافر)(?=\s*[:#\-–=]))(?:\s*[:#\-–=]\s*|\s{2,}|\t)([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF \t\/\\–-]{2,35})/gi;
  let pMatch: RegExpExecArray | null = null;
  while ((pMatch = labelPaxRegex.exec(text)) !== null) {
    const rawVal = pMatch[1].split(/(?:\r?\n|\b(?:TKT|ETKT|DATE|ROUTE|CLASS|FARE|TOTAL|PNR|BOOKING|FLIGHT)\b|(?=[#|])|(?:^|\s)(?:رقم\s*التذكرة|تذكرة\s*رقم|رقم\s*التذكره|تذكره\s*رقم|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*المعاملة|تاريخ\s*المعامله))/i)[0].trim();
    if (isValidPaxName(rawVal)) {
      const formatted = formatPaxName(rawVal);
      if (formatted && !foundPaxNames.includes(formatted)) {
        foundPaxNames.push(formatted);
      }
    }
  }

  // Format F: Standalone uppercase slash names (e.g. "OSMAN/MUHAMMAD MR")
  for (const line of lines) {
    const slashMatch = line.match(/^([A-Z]{2,20}\/[A-Z\s]{2,25}(?:\s+(?:MR|MRS|MS|MSTR))?)$/i);
    if (slashMatch && isValidPaxName(slashMatch[1])) {
      const formatted = formatPaxName(slashMatch[1]);
      if (formatted && !foundPaxNames.includes(formatted)) {
        foundPaxNames.push(formatted);
      }
    }
  }

  // Format G: Direct line "1. SOFIAN DABLOUK - 367 2420 778012" or "SOFIAN DABLOUK / 3672420768221"
  for (const line of lines) {
    const directLine = line.match(/(?:(?:^|\s)(?:\d+[\.\-\)]\s*)?(?:(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Mstr\.?)\s+)?)([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF \t\/\\–-]{2,35}?)\s*(?:[-–|/:]|\s+TKT:?|\s+ETKT:?|\s+TICKET:?|\s+)\s*(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\b\d{13,14}\b)/i);
    if (directLine) {
      const candName = directLine[1].trim();
      const tNo = directLine[2].replace(/\D/g, '');
      if (isValidPaxName(candName) && tNo.length >= 10 && tNo.length <= 14) {
        const name = formatPaxName(candName);
        if (name && !passengers.some(p => p.ticketNo === tNo || p.name === name)) {
          passengers.push({ name, ticketNo: tNo });
          if (!foundPaxNames.includes(name)) foundPaxNames.push(name);
          if (!foundTicketNos.includes(tNo)) foundTicketNos.push(tNo);
        }
      }
    }
  }

  // Format H: "367 2420 778012 - SOFIAN DABLOUK"
  for (const line of lines) {
    const inverseLine = line.match(/(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\b\d{13,14}\b)\s*(?:[-–|/:]|\s+FOR\s+|\s+PAX:?\s+|\s+)([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF \t\/\\–-]{2,35})/i);
    if (inverseLine) {
      const tNo = inverseLine[1].replace(/\D/g, '');
      const candName = inverseLine[2].trim();
      if (isValidPaxName(candName) && tNo.length >= 10 && tNo.length <= 14) {
        const name = formatPaxName(candName);
        if (name && !passengers.some(p => p.ticketNo === tNo || p.name === name)) {
          passengers.push({ name, ticketNo: tNo });
          if (!foundPaxNames.includes(name)) foundPaxNames.push(name);
          if (!foundTicketNos.includes(tNo)) foundTicketNos.push(tNo);
        }
      }
    }
  }

  // Format I: Adjacent consecutive lines at top of ticket (e.g. Line 1: PAX NAME, Line 2: TKT NUMBER or vice versa)
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i].trim();
    const l2 = lines[i + 1].trim();

    // Case 1: Line i is name, Line i+1 is ticket number
    const tktMatchL2 = l2.match(/^(?:(?:TKT|ETKT|TICKET|TKT\s*NO|TICKET\s*NUMBER|رقم\s*التذكرة|تذكرة\s*رقم)[\s:#-]*)?(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\b\d{13,14}\b)$/i);
    if (tktMatchL2 && isValidPaxName(l1)) {
      const cleanTkt = tktMatchL2[1].replace(/\D/g, '');
      const formattedName = formatPaxName(l1);
      if (formattedName && cleanTkt.length >= 10 && cleanTkt.length <= 14) {
        if (!passengers.some(p => p.ticketNo === cleanTkt || p.name === formattedName)) {
          passengers.push({ name: formattedName, ticketNo: cleanTkt });
          if (!foundPaxNames.includes(formattedName)) foundPaxNames.push(formattedName);
          if (!foundTicketNos.includes(cleanTkt)) foundTicketNos.push(cleanTkt);
        }
      }
    }

    // Case 2: Line i is ticket number, Line i+1 is name
    const tktMatchL1 = l1.match(/^(?:(?:TKT|ETKT|TICKET|TKT\s*NO|TICKET\s*NUMBER|رقم\s*التذكرة|تذكرة\s*رقم)[\s:#-]*)?(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\b\d{13,14}\b)$/i);
    if (tktMatchL1 && isValidPaxName(l2)) {
      const cleanTkt = tktMatchL1[1].replace(/\D/g, '');
      const formattedName = formatPaxName(l2);
      if (formattedName && cleanTkt.length >= 10 && cleanTkt.length <= 14) {
        if (!passengers.some(p => p.ticketNo === cleanTkt || p.name === formattedName)) {
          passengers.push({ name: formattedName, ticketNo: cleanTkt });
          if (!foundPaxNames.includes(formattedName)) foundPaxNames.push(formattedName);
          if (!foundTicketNos.includes(cleanTkt)) foundTicketNos.push(cleanTkt);
        }
      }
    }
  }

  // Backfill missing fields in existing passengers array
  for (let i = 0; i < passengers.length; i++) {
    if (!passengers[i].ticketNo && foundTicketNos[i]) {
      passengers[i].ticketNo = foundTicketNos[i];
    }
    if (!passengers[i].name && foundPaxNames[i]) {
      passengers[i].name = foundPaxNames[i];
    }
  }

  // Ensure found passenger names and found ticket numbers are properly paired into passengers array
  if (passengers.length === 0) {
    const count = Math.max(foundPaxNames.length, foundTicketNos.length);
    for (let i = 0; i < count; i++) {
      const name = foundPaxNames[i] || (foundTicketNos.length === 1 && foundPaxNames[0] ? foundPaxNames[0] : '');
      const ticketNo = foundTicketNos[i] || '';
      if (name || ticketNo) {
        passengers.push({ name, ticketNo });
      }
    }
  } else {
    // If we already have paired passengers, only add remaining passengers if there are UNUSED REAL ticket numbers
    const existingTkts = new Set(passengers.map(p => p.ticketNo).filter(Boolean));
    const existingNames = new Set(passengers.map(p => p.name.toLowerCase()).filter(Boolean));
    const unusedTkts = foundTicketNos.filter(t => !existingTkts.has(t));
    const unusedNames = foundPaxNames.filter(n => !existingNames.has(n.toLowerCase()));

    // Only pair if there are unused actual ticket numbers found on the ticket
    const pairCount = Math.min(unusedNames.length, unusedTkts.length);
    for (let i = 0; i < pairCount; i++) {
      const name = unusedNames[i];
      const ticketNo = unusedTkts[i];
      if (name && ticketNo && !passengers.some(p => p.ticketNo === ticketNo || p.name === name)) {
        passengers.push({ name, ticketNo });
      }
    }
  }

  // --- 3. PNR / Booking Reference ---
  let pnr = '';
  const pnrBeforeMatch = text.match(/\b([A-Z0-9]{5,8})\s+(?:BOOKING\s*REF|BOOKING\s*REFERENCE|PNR|RESERVATION|مرجع\s*الحجز|رقم\s*الحجز)/i);
  if (pnrBeforeMatch && !/^(?:TICKET|PAYMENT|TOTAL|AMOUNT|FLIGHT|STATUS|ADULT|SDG|USD|EUR|RECEIPT|CLASS)$/i.test(pnrBeforeMatch[1])) {
    pnr = pnrBeforeMatch[1].toUpperCase();
  }

  if (!pnr) {
    const explicitPnr = text.match(/(?:PNR|LOC|BOOKING\s*REF|BOOKING\s*REFERENCE|RESERVATION|RECORD\s*LOCATOR|رقم الحجز|مرجع الحجز)[\s#:]+([A-Z0-9]{5,8})\b/i);
    if (explicitPnr && explicitPnr[1] && !/^(?:TICKET|PAYMENT|TOTAL|AMOUNT|FLIGHT|STATUS|ADULT|SDG|USD|EUR|RECEIPT|CLASS)$/i.test(explicitPnr[1])) {
      pnr = explicitPnr[1].toUpperCase();
    }
  }

  if (!pnr) {
    // Check GDS header line ending with 5-6 alphanumeric characters (e.g. RP/KRT1A... 6ABCDE)
    const gdsRpMatch = text.match(/(?:RP\/|1A\/|SABRE\/)[^\n]*?\s([A-Z0-9]{5,6})\s*(?:\r?\n|$)/i);
    if (gdsRpMatch && gdsRpMatch[1]) {
      pnr = gdsRpMatch[1].toUpperCase();
    } else {
      const allSix = Array.from(text.matchAll(/\b([A-Z0-9]{6})\b/g));
      const paxWords = new Set(foundPaxNames.join(' ').toUpperCase().split(/\s+/).filter(Boolean));
      const invalidWords = /^(?:TICKET|TOTALS|SDGUSD|KRTCAI|AGENCY|AIRLIN|OFFICE|ISSUED|PAYMENT|RECEIPT|NUMBER|PASSENGER)$/i;
      const dateToken = /\d+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d*/i;
      for (const m of allSix) {
        const token = m[1].toUpperCase();
        if (!invalidWords.test(token) && !dateToken.test(token) && !paxWords.has(token)) {
          pnr = token;
          break;
        }
      }
    }
  }

  // --- 4. Route ---
  let route = '';
  // Check arrows: "CAI ➜ KRT" or "CAI -> KRT" or "CAI – KRT"
  const arrowMatch = text.match(/([A-Z]{3})\s*(?:➜|→|->|–|-)\s*([A-Z]{3})(?:\s*(?:➜|→|->|–|-)\s*([A-Z]{3}))?/);
  if (arrowMatch) {
    const ignored = new Set(['REF', 'PNR', 'TKT', 'TAX', 'USD', 'SDG', 'EGP', 'SAR', 'AED', 'EUR', 'GBP']);
    if (!ignored.has(arrowMatch[1].toUpperCase()) && !ignored.has(arrowMatch[2].toUpperCase())) {
      route = arrowMatch[3] ? `${arrowMatch[1]} – ${arrowMatch[2]} – ${arrowMatch[3]}` : `${arrowMatch[1]} – ${arrowMatch[2]}`;
    }
  }

  // Check airport codes in parentheses: "Cairo Intl (CAI) Khartoum (KRT)"
  if (!route) {
    const parenMatches = Array.from(text.matchAll(/\(([A-Z]{3})\)/g)).map(x => x[1].toUpperCase());
    const validParens = parenMatches.filter(c => !RESERVED_WORDS.has(c));
    if (validParens.length >= 2) {
      route = validParens.slice(0, 3).join(' – ');
    }
  }

  // Check "NON STOP CITY1 TO CITY2"
  if (!route) {
    const nonStopMatches = Array.from(text.matchAll(/NON STOP\s+([A-Za-z\s]+?)\s+TO\s+([A-Za-z\s]+?)(?:\r?\n|$)/gi));
    if (nonStopMatches.length > 0) {
      const segments: string[] = [];
      for (const ns of nonStopMatches) {
        const fromCity = ns[1].trim().toUpperCase();
        const toCity = ns[2].trim().toUpperCase();
        const fromCode = CITY_AIRPORT_MAP[fromCity] || fromCity.slice(0, 3);
        const toCode = CITY_AIRPORT_MAP[toCity] || toCity.slice(0, 3);
        if (segments.length === 0) segments.push(fromCode);
        segments.push(toCode);
      }
      if (segments.length >= 2) {
        route = segments.join(' – ');
      }
    }
  }

  // Check line by line DEPARTURE / ARRIVAL
  if (!route) {
    const depRegex = /(?:DEPARTURE|المغادرة)[:\s]+([A-Za-z\s]+?)(?:,|\(|$|\r?\n)/i;
    const arrRegex = /(?:ARRIVAL|الوصول)[:\s]+([A-Za-z\s]+?)(?:,|\(|$|\r?\n)/i;
    const segs: string[] = [];
    for (const l of lines) {
      const dm = l.match(depRegex);
      if (dm) {
        const fromCity = dm[1].trim().toUpperCase();
        const fromCode = CITY_AIRPORT_MAP[fromCity] || (fromCity.length === 3 ? fromCity : '');
        if (fromCode && (segs.length === 0 || segs[segs.length - 1] !== fromCode)) segs.push(fromCode);
      }
      const am = l.match(arrRegex);
      if (am) {
        const toCity = am[1].trim().toUpperCase();
        const toCode = CITY_AIRPORT_MAP[toCity] || (toCity.length === 3 ? toCity : '');
        if (toCode && (segs.length === 0 || segs[segs.length - 1] !== toCode)) segs.push(toCode);
      }
    }
    if (segs.length >= 2) {
      route = segs.join(' – ');
    }
  }

  // Check labeled route: ROUTE: KRT-CAI
  if (!route) {
    const routeLabel = text.match(/(?:ROUTE|FROM\/TO|SECTOR|خط السير|خط الرحلة)[:\s]+([A-Z\u0600-\u06FF]{3}[A-Z\u0600-\u06FF0-9\s\-\/–]{2,25})/i);
    if (routeLabel) {
      const rawR = routeLabel[1].trim().toUpperCase();
      const parts = rawR.match(/\b([A-Z]{3})\b/g);
      if (parts && parts.length >= 2) {
        route = parts.slice(0, 3).join(' – ');
      } else {
        route = rawR;
      }
    }
  }

  // Check standard 3-letter airport pairs
  if (!route) {
    const ignoredAirportWords = new Set(['REF', 'PNR', 'TKT', 'TAX', 'USD', 'SDG', 'EGP', 'SAR', 'AED', 'EUR', 'GBP', 'MRS', 'CLS', 'PAX', 'ORG', 'DES', 'FOR', 'AND', 'NOT']);
    const allAirportMatches = Array.from(text.matchAll(/\b([A-Z]{3})\s*[-/–]\s*([A-Z]{3})(?:\s*[-/–]\s*([A-Z]{3}))?\b/gi));
    for (const match of allAirportMatches) {
      const r1 = match[1].toUpperCase();
      const r2 = match[2].toUpperCase();
      const r3 = match[3] ? match[3].toUpperCase() : '';
      if (!ignoredAirportWords.has(r1) && !ignoredAirportWords.has(r2) && (!r3 || !ignoredAirportWords.has(r3))) {
        route = r3 ? `${r1} – ${r2} – ${r3}` : `${r1} – ${r2}`;
        break;
      }
    }
  }

  // Check GDS flight segment route (e.g. KRTCAI HK2)
  if (!route) {
    const segMatch = text.match(/\b([A-Z]{3})([A-Z]{3})\b(?:\s+(?:HK|RR|SS|NN|TK|DK)\d|\s+\d{4})/i);
    if (segMatch) {
      route = `${segMatch[1].toUpperCase()} – ${segMatch[2].toUpperCase()}`;
    }
  }

  // --- 5. Class ---
  let travelClass = '';
  const confirmedClassMatch = text.match(/(?:RESERVATION\s*CONFIRMED[,\s]+)?(?:ECONOMY|BUSINESS|FIRST)[,\s]*\(([A-Z])\)/i);
  if (confirmedClassMatch) {
    travelClass = confirmedClassMatch[1].toUpperCase();
  } else {
    const cabinMatch = text.match(/(?:CABIN|CLASS|الكلاس|الدرجة)[:\s]+(Economy(?:\s*class)?|Business(?:\s*class)?|First(?:\s*class)?|[A-Z])\b/i) || text.match(/\b(Economy(?:\s*class)?|Business(?:\s*class)?|First(?:\s*class)?)\b/i);
    if (cabinMatch) {
      travelClass = cabinMatch[1].toUpperCase().startsWith('ECON') ? 'Y' : cabinMatch[1].toUpperCase().startsWith('BUSI') ? 'C' : cabinMatch[1].toUpperCase().startsWith('FIRS') ? 'F' : cabinMatch[1].toUpperCase();
    } else {
      const fareBasisMatch = text.match(/FARE\s*BASIS[:\s]+([A-Z])\b/i);
      if (fareBasisMatch) {
        travelClass = fareBasisMatch[1].toUpperCase();
      } else {
        const gdsClass = text.match(/\b\d{2,4}\s+([YJCWFMLKQVXBSTNHPUOIE])\s+[0-3]\d[A-Z]{3}\b/i);
        if (gdsClass) travelClass = gdsClass[1].toUpperCase();
      }
    }
  }

  // --- 6. Currency ---
  let currency = 'USD';
  const currMatch = text.match(/\b(USD|SAR|AED|SDG|EGP|EUR|GBP|QAR|KWD|OMR|BHD|ج\.س|ر\.س|د\.إ|ج\.م|ر\.ق|د\.ك|ر\.ع|د\.ب|دولار|ريال\s*سعودي|ريال|درهم\s*إماراتي|درهم|جنيه\s*سوداني|جنيه\s*مصري|جنيهات|جنيه|يورو|\$|€)\b/i);
  if (currMatch) {
    const rawC = currMatch[1].toUpperCase();
    if (rawC === 'USD' || rawC === 'دولار' || rawC === '$') currency = 'USD';
    else if (rawC === 'SDG' || rawC.includes('سوداني') || rawC === 'ج.س' || rawC === 'جنيه' || rawC === 'جنيهات') currency = 'SDG';
    else if (rawC === 'SAR' || rawC.includes('سعودي') || rawC === 'ر.س' || rawC === 'ريال') currency = 'SAR';
    else if (rawC === 'AED' || rawC.includes('إماراتي') || rawC === 'د.إ' || rawC === 'درهم') currency = 'AED';
    else if (rawC === 'EGP' || rawC.includes('مصري') || rawC === 'ج.م') currency = 'EGP';
    else if (rawC === 'EUR' || rawC === 'يورو' || rawC === '€') currency = 'EUR';
    else if (rawC === 'QAR' || rawC === 'ر.ق') currency = 'QAR';
    else if (rawC === 'KWD' || rawC === 'د.ك') currency = 'KWD';
    else if (rawC === 'OMR' || rawC === 'ر.ع') currency = 'OMR';
    else if (rawC === 'BHD' || rawC === 'د.ب') currency = 'BHD';
    else currency = rawC;
  }

  // --- 7. Fare & Total ---
  let singleTotal = 0;
  let singleFare = 0;

  // Total amount labeled in receipts and tickets
  // 1. Explicit Total / Ticket Amount
  const explicitTotalMatch = text.match(/(?:TOTAL\s*AMOUNT|TICKET\s*AMOUNT|TOTAL\s*FARE|GRAND\s*TOTAL|FINAL\s*TOTAL|TOTAL\s*FOR\s*ALL|TICKET\s*TOTAL|المبلغ\s*الإجمالي|المبلغ\s*الكلي|إجمالي\s*التذكرة|الإجمالي|التوتل|(?:^|\s)TOTAL\b)[\s:]+(?:(?:USD|SAR|AED|SDG|EGP|EUR|QAR|KWD|OMR|BHD|ج\.س|ر\.س|د\.إ|ج\.م|دولار|ريال|درهم|جنيه|\$|€)\s*)?([\d,]+\.?\d*)/i);
  if (explicitTotalMatch) {
    singleTotal = Number(explicitTotalMatch[1].replace(/,/g, ''));
  }

  // 2. Financial statement / Transfer / Receipt amount
  if (!singleTotal || singleTotal <= 0) {
    const transferTotalMatch = text.match(/(?:TRANSFER\s*AMOUNT|PAID\s*AMOUNT|NET\s*AMOUNT|DEBIT\s*AMOUNT|CREDIT\s*AMOUNT|المبلغ\s*المحول|المبلغ\s*المدفوع|مبلغ\s*التحويل|المبلغ\s*المسحوب|المبلغ\s*المودع|قيمة\s*التحويل|قيمة\s*المعاملة|قيمة\s*العملية|المبلغ\s*المقبوض|الصافي)[\s:]+(?:(?:USD|SAR|AED|SDG|EGP|EUR|QAR|KWD|OMR|BHD|ج\.س|ر\.س|د\.إ|ج\.م|دولار|ريال|درهم|جنيه|\$|€)\s*)?([\d,]+\.?\d*)/i);
    if (transferTotalMatch) singleTotal = Number(transferTotalMatch[1].replace(/,/g, ''));
  }

  // 3. Fallback generic amount (excluding base fare amount)
  if (!singleTotal || singleTotal <= 0) {
    const genericAmountMatch = text.match(/(?<!BASE\s*FARE\s*)(?:^|\s)(?:AMOUNT|المبلغ)[\s:]+(?:(?:USD|SAR|AED|SDG|EGP|EUR|QAR|KWD|OMR|BHD|ج\.س|ر\.س|د\.إ|ج\.م|دولار|ريال|درهم|جنيه|\$|€)\s*)?([\d,]+\.?\d*)/i);
    if (genericAmountMatch) singleTotal = Number(genericAmountMatch[1].replace(/,/g, ''));
  }

  // Number immediately adjacent to currency code (e.g. "150,000.00 SDG" or "SDG 150,000" or "10,000 ج.س")
  if (!singleTotal || singleTotal <= 0) {
    const currNumMatch = text.match(/(?:USD|SAR|AED|SDG|EGP|EUR|QAR|KWD|OMR|BHD|ج\.س|ر\.س|د\.إ|ج\.م)\s*([\d,]+\.?\d{1,2})/i) ||
                         text.match(/([\d,]+\.?\d{1,2})\s*(?:USD|SAR|AED|SDG|EGP|EUR|QAR|KWD|OMR|BHD|ج\.س|ر\.س|د\.إ|ج\.م)/i);
    if (currNumMatch) {
      singleTotal = Number(currNumMatch[1].replace(/,/g, ''));
    }
  }

  // Bank transfer statement: "تم تحويل مبلغ 150,000" or "تم سداد مبلغ 20,000"
  if (!singleTotal || singleTotal <= 0) {
    const bankTransferMatch = text.match(/تم\s*(?:تحويل|سداد|خصم|إيداع|دفع|توريد)\s*(?:مبلغ)?\s*([\d,]+\.?\d*)/i);
    if (bankTransferMatch) {
      singleTotal = Number(bankTransferMatch[1].replace(/,/g, ''));
    }
  }

  // Base fare amount 164.00 USD or Base fare 164.00 or FARE: USD 250.00
  const fareMatch = text.match(/(?:BASE\s*FARE\s*AMOUNT|BASE\s*FARE|FARE|الأساس|سعر الأساس)[\s:]+(?:[A-Z]{3}\s*)?([\d,]+\.?\d*)/i);
  if (fareMatch) singleFare = Number(fareMatch[1].replace(/,/g, ''));

  // Taxes
  const taxes: Record<string, number> = {};
  const taxSumMatch = text.match(/(?:TAX\s*AND\s*SURCHARGES|TAXES|الضرائب)[\s:]+(?:[A-Z]{3}\s*)?([\d,]+\.?\d*)/i);
  if (taxSumMatch) {
    taxes['XT'] = Number(taxSumMatch[1].replace(/,/g, ''));
  }
  const taxDetailRegex = /\b([A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])\s*:\s*([\d,]+(?:\.\d+)?)/g;
  let taxDetailMatch: RegExpExecArray | null;
  while ((taxDetailMatch = taxDetailRegex.exec(text)) !== null) {
    const code = taxDetailMatch[1].toUpperCase();
    const val = Number(taxDetailMatch[2].replace(/,/g, ''));
    if (val > 0 && !/^\d{2}$/.test(code) && !['J4', '3T', 'MS', 'QR', 'SV', 'EK', 'FZ'].includes(code)) {
      taxes[code] = val;
    }
  }

  // Fallback if no singleTotal found: look for formatted amount
  if (!singleTotal || singleTotal <= 0) {
    const fallbackNumbers = Array.from(text.matchAll(/\b([\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})\b/g))
      .map(m => Number(m[1].replace(/,/g, '')))
      .filter(n => n > 0 && n < 1000000000);
    if (fallbackNumbers.length > 0) {
      singleTotal = fallbackNumbers[0];
    }
  }

  // Calculate grand total: explicit total amount from ticket is final
  const paxCount = passengers.length > 0 ? passengers.length : 1;
  let combinedTotal = singleTotal;
  let combinedFare = singleFare;

  const multiTotalCheck = text.match(/(?:TOTAL\s*FOR\s*ALL|GRAND\s*TOTAL|الإجمالي\s*الكلي)[:\s]+(?:[A-Z]{3}\s*)?([\d,]+\.?\d*)/i);
  if (multiTotalCheck) {
    combinedTotal = Number(multiTotalCheck[1].replace(/,/g, ''));
  }

  // Scale tax breakdown proportionally if per-passenger taxes were extracted for multi-pax
  if (paxCount > 1 && Object.keys(taxes).length > 0) {
    const rawTaxSum = Object.values(taxes).reduce<number>((s, v) => s + Number(v || 0), 0);
    const expectedTaxSum = combinedTotal - combinedFare;
    if (rawTaxSum > 0 && expectedTaxSum > 0 && Math.abs(rawTaxSum * paxCount - expectedTaxSum) <= (paxCount * 5)) {
      for (const k of Object.keys(taxes)) {
        taxes[k] = taxes[k] * paxCount;
      }
    }
  }

  // --- 8. Date ---
  const date = parseTicketDate(text);

  // --- 9. Airline ---
  let airline = '';
  // Check known airline brand names / Arabic names first
  const knownAirlines = [
    { pattern: /\b(?:Badr(?:\s*Airlines)?|بدر(?:\s*للطيران)?)\b/i, name: 'BADR AIRLINES' },
    { pattern: /\b(?:Tarco(?:\s*Aviation|\s*Airlines)?|تاركو(?:\s*للطيران)?)\b/i, name: 'TARCO AVIATION' },
    { pattern: /\b(?:Sudan\s*Airways|سودانير|الخطوط\s*الجوية\s*السودانية)\b/i, name: 'SUDAN AIRWAYS' },
    { pattern: /\b(?:EgyptAir|مصر\s*للطيران)\b/i, name: 'EGYPTAIR' },
    { pattern: /\b(?:Air\s*Cairo|إير\s*كايرو)\b/i, name: 'AIR CAIRO' },
    { pattern: /\b(?:Saudia|Saudi\s*Arabian(?:\s*Airlines)?|السعودية|الخطوط\s*السعودية)\b/i, name: 'SAUDIA' },
    { pattern: /\b(?:Qatar\s*Airways?|القطرية|الخطوط\s*القطرية)\b/i, name: 'QATAR AIRWAYS' },
    { pattern: /\b(?:FlyDubai|فلاي\s*دبي)\b/i, name: 'FLYDUBAI' },
    { pattern: /\b(?:Emirates(?:\s*Airlines)?|طيران\s*الإمارات|الإماراتية)\b/i, name: 'EMIRATES' },
    { pattern: /\b(?:Flynas|طيران\s*ناس|فلاي\s*ناس)\b/i, name: 'FLYNAS' },
    { pattern: /\b(?:Jazeera(?:\s*Airways)?|طيران\s*الجزيرة|الجزيرة)\b/i, name: 'JAZEERA AIRWAYS' },
    { pattern: /\b(?:Salam\s*Air|SalamAir|طيران\s*السلام|السلام)\b/i, name: 'SALAMAIR' },
    { pattern: /\b(?:Air\s*Arabia|العربية\s*للطيران)\b/i, name: 'AIRARABIA' },
    { pattern: /\b(?:Ethiopian(?:\s*Airlines)?|الخطوط\s*الإثيوبية)\b/i, name: 'ETHIOPIAN AIRLINES' },
    { pattern: /\b(?:Turkish(?:\s*Airlines)?|الخطوط\s*التركية|التركية)\b/i, name: 'TURKISH AIRLINES' }
  ];
  for (const ka of knownAirlines) {
    if (ka.pattern.test(text)) {
      airline = ka.name;
      break;
    }
  }

  // Check flight prefix (e.g. J4170 -> BADR AIRLINES, 3T117 -> TARCO, QR 4992 -> QATAR AIRWAYS)
  if (!airline) {
    const flightMatch = text.match(/\b([A-Z0-9]{2})\s*\d{3,4}\b/);
    if (flightMatch && AIRLINE_IATA_MAP[flightMatch[1]]) {
      airline = AIRLINE_IATA_MAP[flightMatch[1]];
    }
  }

  // Check ticket number 3-digit prefix (e.g. 524 -> TARCO, 367 -> BADR, 247 -> BADR, 157 -> QATAR)
  const firstTkt = passengers[0]?.ticketNo || foundTicketNos[0] || '';
  if (!airline && firstTkt.length >= 3) {
    const prefix3 = firstTkt.slice(0, 3);
    if (AIRLINE_PREFIX_MAP[prefix3]) {
      airline = AIRLINE_PREFIX_MAP[prefix3];
    }
  }

  // Fallback: explicit labeled airline (excluding privacy / legal sentences)
  if (!airline) {
    const explicitAirline = text.match(/(?:AIRLINE|CARRIER|الخطوط|شركة الطيران)[:\s]+([^\r\n,;:]{3,35})/i);
    if (explicitAirline) {
      const cand = explicitAirline[1].trim();
      if (!/^(?:or|and|is|are|the|privacy|directly|policy|conditions)\b/i.test(cand)) {
        airline = cand;
      }
    }
  }

  // --- 10. Reference Code / Transaction ID ---
  let referenceCode = '';
  const refMatch = text.match(/(?:الرقم\s*المرجعي|رقم\s*العملية|رقم\s*المعاملة|رقم\s*الحوالة|رقم\s*الإشعار|رقم\s*السند|رقم\s*الإيصال|مرجع\s*العملية|مرجع\s*التحويل|Transaction\s*ID|Ref(?:erence)?(?:\s*No\.?)?|Seq(?:\s*No\.?)?|FT\d+)[\s:]+([A-Za-z0-9\-_]{5,30})/i);
  if (refMatch) {
    referenceCode = refMatch[1].trim();
  }

  // --- 11. Financial Direction ---
  let financialDirection: 'deposit' | 'withdraw' | undefined;
  if (/(?:إيداع|قبض|تحويل\s*إلى|تم\s*التحويل\s*بنجاح|إشعار\s*إضافة|إشعار\s*تحويل|المستفيد|توريد|وارد)/i.test(text)) {
    financialDirection = 'deposit';
  } else if (/(?:سحب|صرف|خصم|سداد|صادر|مدفوعات)/i.test(text)) {
    financialDirection = 'withdraw';
  }

  // --- 12. Financial Notes ---
  let financialNotes = '';
  if (/بنك\s*الخرطوم|بنكك|bankak/i.test(text)) {
    financialNotes = `إشعار تحويل بنكك - بنك الخرطوم${referenceCode ? ` (مرجع: ${referenceCode})` : ''}`;
  } else if (/الراجحي|al\s*rajhi/i.test(text)) {
    financialNotes = `إشعار تحويل مصرف الراجحي${referenceCode ? ` (مرجع: ${referenceCode})` : ''}`;
  } else if (/فوري|fawry/i.test(text)) {
    financialNotes = `إيصال دفع فوري${referenceCode ? ` (مرجع: ${referenceCode})` : ''}`;
  } else if (/بنك\s*فيصل/i.test(text)) {
    financialNotes = `إشعار تحويل بنك فيصل الإسلامي${referenceCode ? ` (مرجع: ${referenceCode})` : ''}`;
  } else if (/الأهلي|snb/i.test(text)) {
    financialNotes = `إشعار تحويل البنك الأهلي${referenceCode ? ` (مرجع: ${referenceCode})` : ''}`;
  } else if (referenceCode) {
    financialNotes = `إشعار عملية مالية (مرجع: ${referenceCode})`;
  }

  // --- 13. Customer Name: NEVER AUTO-FILL (The user specifies it!) ---
  const customerName = '';

  const resPaxList = passengers.map(p => p.name).filter(Boolean);
  const resTktList = passengers.map(p => p.ticketNo).filter(Boolean);

  return {
    passengers,
    passenger: passengers[0]?.name || foundPaxNames[0] || '',
    ticketNo: (passengers[0]?.ticketNo || foundTicketNos[0] || '').replace(/\D/g, ''),
    allPassengers: resPaxList.length > 0 ? resPaxList : foundPaxNames,
    allTicketNos: (resTktList.length > 0 ? resTktList : foundTicketNos).map(t => t.replace(/\D/g, '')),
    pnr,
    route,
    class: travelClass,
    currency,
    fare: combinedFare || undefined,
    total: combinedTotal || undefined,
    airline,
    customerName,
    date,
    taxes: Object.keys(taxes).length > 0 ? taxes : undefined,
    rawText: text,
    referenceCode: referenceCode || undefined,
    financialDirection,
    financialNotes: financialNotes || undefined
  };
}

/**
 * Extracts plain text from a PDF file using pdfjs-dist
 * Loops through all pages to capture multi-passenger e-ticket pages
 */
export async function extractTextFromPDF(dataBuffer: ArrayBuffer | Uint8Array): Promise<{ fullText: string; pageTexts: string[] }> {
  try {
    const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfjs = (pdfjsModule as any).default || pdfjsModule;

    if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions) {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }
    }

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(dataBuffer),
      disableFontFace: true,
      useSystemFonts: true
    }).promise;

    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      // Sort items geometrically: top-to-bottom (Y descending), then left-to-right (X ascending)
      // This guarantees that top-left passenger names and ticket numbers on the same or consecutive lines
      // are extracted together in natural reading order!
      const sortedItems = [...(textContent.items || [])].sort((a: any, b: any) => {
        const yA = a.transform ? a.transform[5] : 0;
        const yB = b.transform ? b.transform[5] : 0;
        if (Math.abs(yA - yB) > 4) {
          return yB - yA; // Higher Y is higher on page (top to bottom)
        }
        const xA = a.transform ? a.transform[4] : 0;
        const xB = b.transform ? b.transform[4] : 0;
        return xA - xB; // Left to right
      });

      let lastY: number | null = null;
      const chunks: string[] = [];
      for (const item of sortedItems) {
        const str = item.str || '';
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
          chunks.push('\n');
        } else if (item.hasEOL) {
          chunks.push('\n');
        } else if (chunks.length > 0 && !chunks[chunks.length - 1].endsWith('\n')) {
          chunks.push(' ');
        }
        chunks.push(str);
        if (y !== null) lastY = y;
      }
      const pageStr = chunks.join('');
      pageTexts.push(pageStr);
    }

    const ticketPages = pageTexts.filter(pt => !isNoticeOrTermsPage(pt));
    const effectivePageTexts = ticketPages.length > 0 ? ticketPages : pageTexts;
    const fullText = effectivePageTexts.join('\n\n--- PAGE BREAK ---\n\n');
    if (fullText.trim().length > 10) {
      return { fullText, pageTexts: effectivePageTexts };
    }
  } catch (err) {
    console.warn('PDF.js parsing failed, attempting fallback decompression:', err);
  }

  // Fallback 1: pure-JS Flate stream decompression using pako
  try {
    const pakoModule = await import('pako');
    const pako = (pakoModule as any).default || pakoModule;
    const bytes = new Uint8Array(dataBuffer);
    let latinStr = '';
    for (let i = 0; i < bytes.length; i++) {
      latinStr += String.fromCharCode(bytes[i]);
    }
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    const chunks: string[] = [];
    while ((m = streamRegex.exec(latinStr)) !== null) {
      const rawChunk = new Uint8Array(m[1].length);
      for (let j = 0; j < m[1].length; j++) rawChunk[j] = m[1].charCodeAt(j);
      try {
        const decompressed = pako.inflate(rawChunk);
        let decStr = '';
        for (let k = 0; k < decompressed.length; k++) decStr += String.fromCharCode(decompressed[k]);
        const matches = decStr.match(/\(([^()]{1,200})\)/g);
        if (matches) {
          chunks.push(matches.map(s => s.slice(1, -1)).join(' '));
        }
      } catch {}
    }
    if (chunks.length > 0) {
      const decompressedText = chunks.join('\n');
      return { fullText: decompressedText, pageTexts: [decompressedText] };
    }
  } catch (e) {
    console.warn('Pako fallback failed:', e);
  }

  // Fallback 2: raw ASCII string match
  const bytes = new Uint8Array(dataBuffer);
  let rawStr = '';
  for (let i = 0; i < bytes.length; i++) {
    if ((bytes[i] >= 32 && bytes[i] <= 126) || bytes[i] === 10 || bytes[i] === 13) {
      rawStr += String.fromCharCode(bytes[i]);
    }
  }
  const matches = rawStr.match(/\(([^()]{2,100})\)\s*(?:Tj|'|")/g) || [];
  const extracted = matches.map(m => m.replace(/^[()]+|[()]+$/g, '')).join(' ');
  return {
    fullText: extracted || rawStr,
    pageTexts: [extracted || rawStr]
  };
}

/**
 * Extracts text from an Image using Tesseract.js OCR
 */
export async function extractTextFromImage(imageDataUri: string): Promise<string> {
  try {
    const Tesseract = await import('tesseract.js');
    let text = '';
    try {
      const { data } = await Tesseract.recognize(imageDataUri, 'ara+eng', {
        logger: () => {}
      });
      text = data.text || '';
    } catch {
      const { data } = await Tesseract.recognize(imageDataUri, 'eng', {
        logger: () => {}
      });
      text = data.text || '';
    }
    return text;
  } catch (err) {
    console.error('Tesseract OCR error:', err);
    return '';
  }
}

/**
 * Universal document analyzer:
 * Takes File object or data URL, detects type, runs PDF text extraction or OCR,
 * and parses all passengers and ticket numbers!
 */
export async function analyzeTicketDocument(
  fileOrData: File | { name: string; type?: string; data: string }
): Promise<ExtractedTicketData> {
  let fileName = '';
  let mimeType = '';
  let dataUri = '';

  if (fileOrData instanceof File) {
    fileName = fileOrData.name;
    mimeType = fileOrData.type;
    // Read file as data URL
    dataUri = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrData);
    });
  } else {
    fileName = fileOrData.name || '';
    mimeType = fileOrData.type || '';
    dataUri = fileOrData.data || '';
  }

  const isPdf = mimeType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf') || dataUri.startsWith('data:application/pdf');
  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(fileName) || dataUri.startsWith('data:image/');

  let result: ExtractedTicketData;

  if (isPdf) {
    // 1. Process PDF file
    const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
    const binaryStr = typeof atob !== 'undefined' ? atob(base64Data) : Buffer.from(base64Data, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const { fullText, pageTexts } = await extractTextFromPDF(bytes);

    // If PDF has multiple pages, check each page for an individual passenger
    // (Tarco Airlines exception: each page has 1 passenger name and ticket number at the top left)
    const effectivePages = pageTexts.filter(pt => !isNoticeOrTermsPage(pt));
    const pagesToAnalyze = effectivePages.length > 0 ? effectivePages : pageTexts;
    const allPageResults = pagesToAnalyze.map(pt => parseTicketTextContent(pt));
    const collectedPax: ExtractedPassenger[] = [];
    let combinedTotal = 0;
    let combinedFare = 0;
    const combinedTaxes: Record<string, number> = {};

    for (const pr of allPageResults) {
      let pageAddedNewPax = false;
      for (const p of pr.passengers) {
        const cleanT = (p.ticketNo || '').replace(/\D/g, '');
        const normN = (p.name || '').trim().toLowerCase();
        if (!collectedPax.some(cp => {
          const cpT = (cp.ticketNo || '').replace(/\D/g, '');
          const cpN = (cp.name || '').trim().toLowerCase();
          return (cleanT && cpT) ? (cleanT === cpT) : (normN && cpN && normN === cpN);
        })) {
          collectedPax.push({
            name: p.name,
            ticketNo: cleanT,
            fare: p.fare,
            total: p.total
          });
          pageAddedNewPax = true;
        }
      }
      if (pageAddedNewPax) {
        if (pr.total) combinedTotal += pr.total;
        if (pr.fare) combinedFare += pr.fare;
        if (pr.taxes) {
          for (const [code, val] of Object.entries(pr.taxes)) {
            combinedTaxes[code] = (combinedTaxes[code] || 0) + Number(val || 0);
          }
        }
      }
    }

    // Combine with fullText parsing
    const overall = parseTicketTextContent(fullText);

    if (collectedPax.length > 0) {
      overall.passengers = collectedPax;
      overall.passenger = collectedPax[0]?.name || '';
      // Ensure ticketNo contains ONLY the single clean ticket number (digits only)
      overall.ticketNo = (collectedPax[0]?.ticketNo || '').replace(/\D/g, '');
      overall.allPassengers = collectedPax.map(p => p.name);
      overall.allTicketNos = collectedPax.map(p => (p.ticketNo || '').replace(/\D/g, ''));
      if (collectedPax.length === 1 && overall.total) {
        // Single passenger: preserve page 1 explicit ticket total!
      } else if (combinedTotal > 0) {
        overall.total = combinedTotal;
      }
      if (combinedFare > 0) overall.fare = combinedFare;
      if (Object.keys(combinedTaxes).length > 0) overall.taxes = combinedTaxes;
    }

    result = overall;
  } else if (isImage) {
    // 2. Process Image file with OCR
    const ocrText = await extractTextFromImage(dataUri);
    const parsed = parseTicketTextContent(ocrText);
    parsed.rawText = ocrText;
    result = parsed;
  } else {
    // 3. Process Text / GDS / PNR file
    let plainText = dataUri;
    if (dataUri.includes(',')) {
      try {
        plainText = decodeURIComponent(escape(atob(dataUri.split(',')[1])));
      } catch {
        plainText = atob(dataUri.split(',')[1]) || dataUri;
      }
    }
    result = parseTicketTextContent(plainText);
  }

  // Fallback PNR / ticket number from filename if available
  if (fileName) {
    const baseName = fileName.replace(/\.[^.]+$/, '').trim();
    if (/^[A-Z0-9]{5,7}$/i.test(baseName) && !result.pnr) {
      result.pnr = baseName.toUpperCase();
    }
    if (/^\d{10,14}$/.test(baseName) && !result.ticketNo) {
      result.ticketNo = baseName;
      if (result.passengers.length === 0) {
        result.passengers.push({ name: result.passenger || '', ticketNo: baseName });
      }
    }
  }

  return result;
}

export interface InvoiceItemFromTicket {
  id: string;
  ticketId?: string;
  ticketNo: string;
  passengerName: string;
  airline: string;
  route: string;
  flightDate: string;
  pnr?: string;
  fare: number;
  taxes: number;
  total: number;
  description?: string;
}

/**
 * Extracts all passengers from a ticket record and divides the price equally
 * so each passenger has their ticket number and divided ticket price in the invoice!
 */
export function extractInvoiceItemsFromTicket(
  tkt: any,
  fallbackToday?: string
): InvoiceItemFromTicket[] {
  if (!tkt) return [];
  const p = tkt.payload || {};
  const tktFare = Number(p.fare || 0);
  const tktTaxes = Object.values(p.taxes || {}).reduce(
    (s: number, v: any) => s + Number(v || 0),
    0
  );
  const tktTotal = Number(tkt.amount || 0) / 100 || tktFare + tktTaxes;

  interface PaxInfo {
    name: string;
    ticketNo: string;
    fare?: number;
    total?: number;
  }

  let paxList: PaxInfo[] = [];

  // Source A: p.passengers array (from multi-passenger OCR or ticket entry)
  if (Array.isArray(p.passengers) && p.passengers.length > 0) {
    paxList = p.passengers
      .map((px: any, idx: number) => {
        if (typeof px === 'string') {
          return {
            name: px.trim(),
            ticketNo: (Array.isArray(p.allTicketNos) && p.allTicketNos[idx]) || (Array.isArray(p.ticketNos) && p.ticketNos[idx]) || tkt.code || '',
          };
        }
        return {
          name: px?.name || px?.passengerName || '',
          ticketNo: px?.ticketNo || px?.code || (Array.isArray(p.allTicketNos) && p.allTicketNos[idx]) || (Array.isArray(p.ticketNos) && p.ticketNos[idx]) || tkt.code || '',
          fare: px?.fare ? Number(px.fare) : undefined,
          total: px?.total ? Number(px.total) : undefined,
        };
      })
      .filter((px: PaxInfo) => Boolean(px.name || px.ticketNo));
  }

  // Source B: p.allPassengers array
  if (paxList.length <= 1 && Array.isArray(p.allPassengers) && p.allPassengers.length > 1) {
    paxList = p.allPassengers
      .map((nameStr: string, idx: number) => ({
        name: String(nameStr || '').trim(),
        ticketNo: (Array.isArray(p.allTicketNos) && p.allTicketNos[idx]) || (Array.isArray(p.ticketNos) && p.ticketNos[idx]) || tkt.code || '',
      }))
      .filter((px: PaxInfo) => Boolean(px.name));
  }

  // Source C: Split tkt.name if it contains multiple passengers separated by ' / '
  if (paxList.length <= 1 && typeof tkt.name === 'string' && tkt.name.includes(' / ')) {
    const splitNames = tkt.name.split(/\s*\/\s*/).map((n: string) => n.trim()).filter(Boolean);
    if (splitNames.length > 1) {
      paxList = splitNames.map((nameStr: string, idx: number) => ({
        name: nameStr,
        ticketNo: (Array.isArray(p.allTicketNos) && p.allTicketNos[idx]) || (Array.isArray(p.ticketNos) && p.ticketNos[idx]) || (idx === 0 ? tkt.code || '' : ''),
      }));
    }
  }

  // Fallback: single passenger
  if (paxList.length === 0) {
    paxList = [
      {
        name: tkt.name || '',
        ticketNo: tkt.code || '',
        fare: tktFare,
        total: tktTotal,
      },
    ];
  }

  const count = paxList.length;
  let accumulatedTotal = 0;
  let accumulatedFare = 0;
  let accumulatedTaxes = 0;

  const defaultDate = fallbackToday || new Date().toISOString().slice(0, 10);

  return paxList.map((pax, index) => {
    const isLast = index === count - 1;

    // Divide total equally across all passengers
    let itemTotal = 0;
    if (pax.total && Number(pax.total) > 0) {
      itemTotal = Number(pax.total);
    } else if (isLast) {
      itemTotal = Math.max(0, Math.round((tktTotal - accumulatedTotal) * 100) / 100);
    } else {
      itemTotal = Math.round((tktTotal / count) * 100) / 100;
    }
    accumulatedTotal += itemTotal;

    // Divide base fare equally across all passengers
    let itemFare = 0;
    if (pax.fare && Number(pax.fare) > 0) {
      itemFare = Number(pax.fare);
    } else if (isLast) {
      itemFare = Math.max(0, Math.round((tktFare - accumulatedFare) * 100) / 100);
    } else {
      itemFare = Math.round((tktFare / count) * 100) / 100;
    }
    accumulatedFare += itemFare;

    // Divide taxes equally across all passengers
    let itemTaxes = 0;
    if (isLast) {
      itemTaxes = Math.max(0, Math.round((tktTaxes - accumulatedTaxes) * 100) / 100);
    } else {
      itemTaxes = Math.round((tktTaxes / count) * 100) / 100;
    }
    accumulatedTaxes += itemTaxes;

    const pName = pax.name || tkt.name || '';
    const tNo = pax.ticketNo || tkt.code || '';

    const randId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'item-' + Math.random().toString(36).slice(2, 11);

    return {
      id: randId,
      ticketId: tkt.id,
      ticketNo: tNo,
      passengerName: pName,
      airline: p.airline || '',
      route: p.route || '',
      flightDate: p.flightDate || tkt.date || defaultDate,
      pnr: p.pnr || '',
      fare: itemFare,
      taxes: itemTaxes,
      total: itemTotal,
      description: `تذكرة طيران ${p.airline || ''} (${p.route || ''}) - مسافر: ${pName}`,
    };
  });
}
