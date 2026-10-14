import {money,today,type Settings} from './domain';

/**
 * Cleans and standardizes international phone numbers for WhatsApp API.
 * Handles common Arab countries formats (Sudan, Egypt, Saudi Arabia, UAE, etc.)
 */
export function cleanWhatsAppPhone(phone: string = ''): string {
  if (!phone) return '';
  // Remove spaces, dashes, dots, brackets
  let digits = phone.replace(/[^0-9+]/g, '');

  // Remove leading zeros or '+'
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  // Handle local prefixes:
  // Egypt: 010, 011, 012, 015 -> 201...
  if (/^01[0125]\d{8}$/.test(digits)) {
    return '20' + digits.slice(1);
  }
  // Sudan: 09, 01 -> 2499..., 2491...
  if (/^0(9|1\d)\d{7}$/.test(digits)) {
    return '249' + digits.slice(1);
  }
  // Saudi Arabia: 05... -> 9665...
  if (/^05\d{8}$/.test(digits)) {
    return '966' + digits.slice(1);
  }
  // UAE: 05... -> 9715...
  if (/^05[024568]\d{7}$/.test(digits)) {
    return '971' + digits.slice(1);
  }

  return digits;
}

/**
 * Builds a universal WhatsApp link.
 */
export function getWhatsAppUrl(phone: string, text: string): string {
  const cleaned = cleanWhatsAppPhone(phone);
  const encoded = encodeURIComponent(text);
  if (cleaned) {
    return `https://wa.me/${cleaned}?text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
}

/**
 * Opens WhatsApp link in a new window/tab.
 */
export function openWhatsAppDirect(phone: string, text: string): void {
  const url = getWhatsAppUrl(phone, text);
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export type TicketWhatsAppProps = {
  ticketCode: string;
  passengerName: string;
  customerName?: string;
  airline?: string;
  route?: string;
  flightDate?: string;
  fareAmount?: number;
  totalAmount: number;
  currency: string;
  receiptNumber?: string;
  pnr?: string;
  settings: Settings;
};

/**
 * Builds formatted WhatsApp message for Flight Ticket Booking Receipt.
 */
export function buildTicketWhatsAppMessage({
  ticketCode,
  passengerName,
  customerName,
  airline,
  route,
  flightDate,
  totalAmount,
  currency,
  receiptNumber,
  pnr,
  settings,
}: TicketWhatsAppProps): string {
  const company = settings.companyName || 'وكالة السفر والسياحة';
  const phones = settings.phones ? `📞 للتواصل: ${settings.phones}` : '';
  const address = settings.address ? `📍 العنوان: ${settings.address}` : '';

  return [
    `✈️ *إيصال حجز تذكرة طيران* ✈️`,
    `🏢 *${company}*`,
    `────────────────────`,
    `👤 *المسافر:* ${passengerName}`,
    customerName && customerName !== passengerName ? `👥 *العميل:* ${customerName}` : '',
    `🎫 *رقم التذكرة:* ${ticketCode}`,
    pnr ? `🔖 *رمز الحجز (PNR):* ${pnr}` : '',
    airline ? `🛫 *شركة الطيران:* ${airline}` : '',
    route ? `🗺️ *خط السير:* ${route}` : '',
    `📅 *تاريخ الحجز / الإصدار:* ${flightDate || today()}`,
    `💵 *إجمالي القيمة:* ${money(Math.round(totalAmount * 100))} ${currency}`,
    receiptNumber ? `🧾 *رقم الإيصال:* ${receiptNumber}` : '',
    `────────────────────`,
    `نتمنى لكم رحلة موفقة وسعيدة دائماً! 🌍`,
    phones,
    address,
  ]
    .filter(Boolean)
    .join('\n');
}

export type ReceiptWhatsAppProps = {
  receiptNumber: string;
  date: string;
  customerName: string;
  amount: number;
  currency: string;
  notes?: string;
  collectorName?: string;
  treasuryName?: string;
  equivalentAmount?: number;
  equivalentCurrency?: string;
  settings: Settings;
};

/**
 * Builds formatted WhatsApp message for Cash/Bank Receipt Voucher.
 */
export function buildReceiptWhatsAppMessage({
  receiptNumber,
  date,
  customerName,
  amount,
  currency,
  notes,
  collectorName,
  treasuryName,
  equivalentAmount,
  equivalentCurrency,
  settings,
}: ReceiptWhatsAppProps): string {
  const company = settings.companyName || 'وكالة السفر والسياحة';
  const phones = settings.phones ? `📞 هاتف الوكالة: ${settings.phones}` : '';

  return [
    `🧾 *سند استلام / قبض مالي معتمد* 🧾`,
    `🏢 *${company}*`,
    `────────────────────`,
    `📋 *رقم السند:* ${receiptNumber}`,
    `📅 *تاريخ السند:* ${date}`,
    `👤 *استلمنا من السيد/السادة:* ${customerName}`,
    `💰 *المبلغ المستلم:* ${money(Math.round(amount * 100))} ${currency}`,
    equivalentAmount && equivalentCurrency && equivalentCurrency !== currency
      ? `💱 *ما يعادله:* ${money(Math.round(equivalentAmount * 100))} ${equivalentCurrency}`
      : '',
    treasuryName ? `🏦 *الخزينة / البنك:* ${treasuryName}` : '',
    notes ? `📝 *وذلك عن:* ${notes}` : '',
    collectorName ? `💼 *المستلم:* ${collectorName}` : '',
    `────────────────────`,
    `نشكركم على حسن تعاملكم ونسعد بخدمتكم دائماً. 🌸`,
    phones,
  ]
    .filter(Boolean)
    .join('\n');
}

export type StatementWhatsAppProps = {
  customerName: string;
  from: string;
  to: string;
  balanceMinor: number;
  currency: string;
  debitMinor?: number;
  creditMinor?: number;
  settings: Settings;
};

/**
 * Builds formatted WhatsApp message for Statement of Account.
 */
export function buildStatementWhatsAppMessage({
  customerName,
  from,
  to,
  balanceMinor,
  currency,
  debitMinor,
  creditMinor,
  settings,
}: StatementWhatsAppProps): string {
  const company = settings.companyName || 'وكالة السفر والسياحة';
  const phones = settings.phones ? `📞 للاستفسار والمطابقة: ${settings.phones}` : '';
  const netBalance = balanceMinor / 100;
  const isDebit = balanceMinor > 0;
  const balanceText = isDebit
    ? `رصيد مستحق على العميل (مدين): ${money(balanceMinor)} ${currency}`
    : balanceMinor < 0
    ? `رصيد دائن للعميل: ${money(Math.abs(balanceMinor))} ${currency}`
    : `الحساب متزن (0.00 ${currency})`;

  return [
    `📊 *كشف حساب مالي* 📊`,
    `🏢 *${company}*`,
    `────────────────────`,
    `👤 *اسم الحساب:* ${customerName}`,
    `📅 *الفترة:* من ${from} إلى ${to}`,
    debitMinor !== undefined ? `📈 *إجمالي المطالبات (مدين):* ${money(debitMinor)} ${currency}` : '',
    creditMinor !== undefined ? `📉 *إجمالي السدادات (دائن):* ${money(creditMinor)} ${currency}` : '',
    `⚖️ *صافي الرصيد الحالي:* ${balanceText}`,
    `────────────────────`,
    `نرجو التكرم بمراجعة الحركات والأرصدة. لأي استفسار لا تترددوا بالاتصال بنا.`,
    phones,
  ]
    .filter(Boolean)
    .join('\n');
}

export type InvoiceWhatsAppProps = {
  invoiceCode: string;
  billedTo: string;
  customerName?: string;
  date: string;
  dueDate?: string;
  totalAmount: number;
  currency: string;
  passengerName?: string;
  ticketCode?: string;
  airline?: string;
  route?: string;
  flightDate?: string;
  language?: 'ar' | 'en' | 'bilingual';
  invoiceType?: 'tax' | 'proforma' | 'standard';
  itemsCount?: number;
  settings: Settings;
};

/**
 * Builds formatted WhatsApp message for Invoice (Arabic, English, or Bilingual).
 */
export function buildInvoiceWhatsAppMessage({
  invoiceCode,
  billedTo,
  customerName,
  date,
  dueDate,
  totalAmount,
  currency,
  passengerName,
  ticketCode,
  airline,
  route,
  flightDate,
  language = 'ar',
  invoiceType = 'standard',
  itemsCount = 1,
  settings,
}: InvoiceWhatsAppProps): string {
  const company = settings.companyName || 'وكالة السفر والسياحة';
  const phones = settings.phones ? `📞 ${settings.phones}` : '';

  const typeLabelAr = invoiceType === 'tax' ? 'فاتورة ضريبية' : invoiceType === 'proforma' ? 'فاتورة مبدئية' : 'فاتورة مبيعات';
  const typeLabelEn = invoiceType === 'tax' ? 'Tax Invoice' : invoiceType === 'proforma' ? 'Proforma Invoice' : 'Sales Invoice';

  if (language === 'en') {
    return [
      `🧾 *${typeLabelEn.toUpperCase()}* 🧾`,
      `🏢 *${company}*`,
      `────────────────────`,
      `📑 *Invoice No:* ${invoiceCode}`,
      `👤 *Billed To:* ${billedTo || customerName || 'Valued Customer'}`,
      `📅 *Date:* ${date}`,
      dueDate ? `⏳ *Due Date:* ${dueDate}` : '',
      `────────────────────`,
      passengerName ? `👤 *Passenger:* ${passengerName}` : '',
      ticketCode ? `🎫 *Ticket No:* ${ticketCode}` : '',
      airline ? `✈️ *Airline:* ${airline}` : '',
      route ? `📍 *Route:* ${route}` : '',
      flightDate ? `🗓️ *Flight Date:* ${flightDate}` : '',
      itemsCount > 1 ? `📦 *Items Count:* ${itemsCount}` : '',
      `────────────────────`,
      `💰 *Total Amount:* ${money(Math.round(totalAmount * 100))} ${currency}`,
      `────────────────────`,
      `Thank you for your business. Please contact us for any payment inquiries.`,
      phones,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Arabic or Bilingual
  return [
    `🧾 *${typeLabelAr}* 🧾`,
    `🏢 *${company}*`,
    `────────────────────`,
    `📑 *رقم الفاتورة:* ${invoiceCode}`,
    `👤 *المطلوب من السادة:* ${billedTo || customerName || 'العميل المحترم'}`,
    `📅 *التاريخ:* ${date}`,
    dueDate ? `⏳ *تاريخ الاستحقاق:* ${dueDate}` : '',
    `────────────────────`,
    passengerName ? `👤 *المسافر:* ${passengerName}` : '',
    ticketCode ? `🎫 *رقم التذكرة:* ${ticketCode}` : '',
    airline ? `✈️ *الخطوط الناقلة:* ${airline}` : '',
    route ? `📍 *خط السير:* ${route}` : '',
    flightDate ? `🗓️ *تاريخ الرحلة:* ${flightDate}` : '',
    itemsCount > 1 ? `📦 *عدد البنود / التذاكر:* ${itemsCount}` : '',
    `────────────────────`,
    `💰 *المجموع الكلي المطلوب:* ${money(Math.round(totalAmount * 100))} ${currency}`,
    `────────────────────`,
    `شاكرين ومقدرين حسن تعاملكم معنا. لأي استفسارات أو تفاصيل السداد نرجو التواصل.`,
    phones,
  ]
    .filter(Boolean)
    .join('\n');
}

