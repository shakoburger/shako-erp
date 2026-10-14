import { cleanText, isValidPaxName, formatPaxName, formatTicketNo, AIRLINE_PREFIX_MAP, AIRLINE_IATA_MAP } from '../lib/ticket-extractor.ts';

const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

export function extractDateFromSubstr(sub) {
  if (!sub) return '';
  // 1. Compact / Space / Dash airline date (e.g. 12OCT26 or 12OCT2026 or 12-OCT-2026 or 12 OCT 2026 or 12 Oct 26)
  const compactMatch = sub.match(/\b([0-3]?\d)\s*[\/\.-]?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*[\/\.-]?\s*(\d{2,4})\b/i);
  if (compactMatch) {
    const d = compactMatch[1].padStart(2, '0');
    const m = months[compactMatch[2].toLowerCase()];
    const y = compactMatch[3].length === 2 ? '20' + compactMatch[3] : compactMatch[3];
    return `${y}-${m}-${d}`;
  }

  // 2. Full month name: 03 OCTOBER 2026 or OCTOBER 03, 2026
  const fullMonth = sub.match(/\b([0-3]?\d)\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(202\d)\b/i);
  if (fullMonth) {
    const d = fullMonth[1].padStart(2, '0');
    const m = months[fullMonth[2].slice(0, 3).toLowerCase()];
    return `${fullMonth[3]}-${m}-${d}`;
  }

  // 3. Slash / Dash / Dot date: 12/10/2026 or 12-10-2026 or 12.10.2026 or 12/10/26
  const slashDate = sub.match(/\b([0-3]?\d)[\/\.-]([01]?\d)[\/\.-](202\d|\d{2})\b/);
  if (slashDate) {
    const d = slashDate[1].padStart(2, '0');
    const m = slashDate[2].padStart(2, '0');
    const y = slashDate[3].length === 2 ? '20' + slashDate[3] : slashDate[3];
    return `${y}-${m}-${d}`;
  }

  // 4. ISO date: 2026-10-12 or 2026/10/12 or 2026.10.12
  const iso = sub.match(/\b(202\d)[\/\.-]([01]\d)[\/\.-]([0-3]\d)\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return '';
}

export function parseTicketDate(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Label patterns for ticket issue date AND financial transaction date
  const dateLabelRegex = /(?:DATE\s*OF\s*ISSUE|DATE\s*OF\s*ISSUANCE|ISSUE\s*DATE|ISSUED\s*ON|ISSUED|ISS\.DATE|DOI|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*إصدار\s*التذكرة|تاريخ\s*التذكرة|تاريخ\s*الحجز|BOOKING\s*DATE|تاريخ\s*المعاملة|تاريخ\s*التحويل|تاريخ\s*العملية|تاريخ\s*الحركة|تاريخ\s*الإشعار|تاريخ\s*السند|تاريخ\s*الإيصال|تاريخ\s*الدفع|تاريخ\s*السداد|تاريخ\s*الإيداع|تاريخ\s*السحب|تاريخ\s*ووقت\s*المعاملة|تاريخ\s*ووقت\s*العملية|TRANSACTION\s*DATE|TRANS\s*DATE|TXN\s*DATE|TRANSFER\s*DATE|PAYMENT\s*DATE|VALUE\s*DATE|DATE\/TIME|DATE\s*&\s*TIME|^DATE\b|^التاريخ\b)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (dateLabelRegex.test(line)) {
      // Check after label on same line
      const afterLabel = line.replace(dateLabelRegex, '').replace(/^[:\s#]+/, '').trim();
      const onSameLine = extractDateFromSubstr(afterLabel);
      if (onSameLine) return onSameLine;

      // Check next line (multiline label!)
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

  // Global fallback across entire text lines
  for (const line of lines) {
    const d = extractDateFromSubstr(line);
    if (d) return d;
  }

  return '';
}

export function parseTicketTextContentNew(raw) {
  const text = cleanText(raw);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const passengers = [];
  const foundTicketNos = [];
  const foundPaxNames = [];

  // --- 1. Multiline Labels (Pass 1) ---
  const paxLabelLineRegex = /^(?:PASSENGER\s*NAME|NAME\s*OF\s*PASSENGER|PASSENGER\(S\)|PASSENGER|PAX\s*NAME|PAX|TRAVELLER|TRAVELER|NAME|اسم\s*الراكب|اسم\s*المسافر|الراكب|المسافر|بيانات\s*الراكب|بيانات\s*المسافر)(?:\s*[:#\/]|\s*$)/i;
  const tktLabelLineRegex = /^(?:TICKET\s*NUMBER|TKT\s*NO|ETKT\s*NO|E-TICKET\s*NUMBER|TICKET|ETKT|E-TICKET|رقم\s*التذكرة|رقم\s*التذكره|التذكرة|التذكره)(?:\s*[:#\/]|\s*$)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check multiline passenger label
    if (paxLabelLineRegex.test(line)) {
      const remainder = line.replace(paxLabelLineRegex, '').replace(/^[:\s#]+/, '').trim();
      if (isValidPaxName(remainder)) {
        const name = formatPaxName(remainder);
        if (name && !foundPaxNames.includes(name)) foundPaxNames.push(name);
      } else if (i + 1 < lines.length && isValidPaxName(lines[i + 1])) {
        const name = formatPaxName(lines[i + 1]);
        if (name && !foundPaxNames.includes(name)) foundPaxNames.push(name);
      }
    }

    // Check multiline ticket number label
    if (tktLabelLineRegex.test(line)) {
      const remainder = line.replace(tktLabelLineRegex, '').replace(/^[:\s#]+/, '').trim();
      const cleanDigits = remainder.replace(/[-\s\/]/g, '');
      const m = cleanDigits.match(/\b\d{10,14}\b/);
      if (m && !foundTicketNos.includes(m[0])) {
        foundTicketNos.push(m[0]);
      } else if (i + 1 < lines.length) {
        const nextDigits = lines[i + 1].replace(/[-\s\/]/g, '');
        const nextM = nextDigits.match(/\b\d{10,14}\b/);
        if (nextM && !foundTicketNos.includes(nextM[0])) {
          foundTicketNos.push(nextM[0]);
        }
      }
    }
  }

  // --- 2. Global scan for spaced / dashed ticket numbers (e.g. 367 2420 778012 or 367-2420778012) ---
  for (const line of lines) {
    const rawNoSpace = line.replace(/[-\s\/]/g, '');
    const globalTkts = Array.from(rawNoSpace.matchAll(/\b\d{13,14}\b/g));
    for (const gt of globalTkts) {
      if (!foundTicketNos.includes(gt[0])) {
        foundTicketNos.push(gt[0]);
      }
    }
  }

  // --- 3. Labeled Single-line Formats ---
  for (const line of lines) {
    const forMatch = line.match(/(?:TKT|ETKT|TICKET)[^0-9]*?(\d{3}[-\s]?\d{10}|\b\d{13,14}\b)\s+FOR\s+([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s\/]{2,35})/i);
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

    const directMatch = line.match(/(?:(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Mstr\.?)\s+)?([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s]{2,30})\s+(\d{3}[-\s]?\d{10}|\b\d{13,14}\b)/i);
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

    const paired = line.match(/([A-Z\u0600-\u06FF]{2,20}\/[A-Z\u0600-\u06FF\s]{2,25})\s+.*?(\d{3}[-\s]?\d{10}|\b\d{13,14}\b)/i);
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

  // Pair found names with found tickets
  const maxPairs = Math.max(foundPaxNames.length, foundTicketNos.length);
  for (let i = 0; i < maxPairs; i++) {
    const name = foundPaxNames[i] || (foundPaxNames.length > 0 ? foundPaxNames[0] : '');
    const ticketNo = foundTicketNos[i] || (foundTicketNos.length > 0 ? foundTicketNos[0] : '');
    if ((name || ticketNo) && !passengers.some(p => (ticketNo && p.ticketNo === ticketNo) || (name && p.name === name))) {
      passengers.push({ name, ticketNo });
    }
  }

  const date = parseTicketDate(text);

  return {
    passengers,
    passenger: passengers[0]?.name || foundPaxNames[0] || '',
    ticketNo: passengers[0]?.ticketNo || foundTicketNos[0] || '',
    allPassengers: passengers.length > 0 ? passengers.map(p => p.name).filter(Boolean) : foundPaxNames,
    allTicketNos: passengers.length > 0 ? passengers.map(p => p.ticketNo).filter(Boolean) : foundTicketNos,
    date
  };
}

const multiLineTicket = `
BADR AIRLINES
ELECTRONIC TICKET / PASSENGER ITINERARY RECEIPT
BOOKING REFERENCE
J4ABC
DATE OF ISSUE
12 OCT 2026
PASSENGER NAME
ELZAIN MOHAMED MR
TICKET NUMBER
367 2420 778012
KRT - CAI
TOTAL
440 USD
`;

const bankNotification = `
إشعار تحويل بنكك - بنك الخرطوم
الرقم المرجعي: FT2610123456
تاريخ المعاملة: 12/10/2026 14:30
المبلغ: 500,000 SDG
المستفيد: أحمد محمد
`;

console.log('Result MultiLine Ticket:');
console.log(parseTicketTextContentNew(multiLineTicket));

console.log('\nResult Bank Notification:');
console.log(parseTicketTextContentNew(bankNotification));
