/**
 * Number to words conversion in Arabic (Tafqeet) and English.
 * Specialized for travel and financial invoicing.
 */

const AR_ONES = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
  'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'
];

const AR_TENS = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'
];

const AR_HUNDREDS = [
  '', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'
];

const EN_ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const EN_TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

const CURRENCY_CONFIG: Record<string, {
  arMain: string;
  arMainDual: string;
  arMainPlural: string;
  arSub: string;
  arSubPlural: string;
  enMain: string;
  enMainPlural: string;
  enSub: string;
  enSubPlural: string;
}> = {
  USD: {
    arMain: 'دولار أمريكي',
    arMainDual: 'دولاران أمريكيان',
    arMainPlural: 'دولارات أمريكية',
    arSub: 'سنت',
    arSubPlural: 'سنتات',
    enMain: 'US Dollar',
    enMainPlural: 'US Dollars',
    enSub: 'Cent',
    enSubPlural: 'Cents',
  },
  EGP: {
    arMain: 'جنيه مصري',
    arMainDual: 'جنيهان مصريان',
    arMainPlural: 'جنيهات مصرية',
    arSub: 'قرش',
    arSubPlural: 'قروش',
    enMain: 'Egyptian Pound',
    enMainPlural: 'Egyptian Pounds',
    enSub: 'Piaster',
    enSubPlural: 'Piasters',
  },
  AED: {
    arMain: 'درهم إماراتي',
    arMainDual: 'درهمان إماراتيان',
    arMainPlural: 'دراهم إماراتية',
    arSub: 'فلس',
    arSubPlural: 'فلس',
    enMain: 'UAE Dirham',
    enMainPlural: 'UAE Dirhams',
    enSub: 'Fil',
    enSubPlural: 'Fils',
  },
  SAR: {
    arMain: 'ريال سعودي',
    arMainDual: 'ريالان سعوديان',
    arMainPlural: 'ريالات سعودية',
    arSub: 'هللة',
    arSubPlural: 'هللات',
    enMain: 'Saudi Riyal',
    enMainPlural: 'Saudi Riyals',
    enSub: 'Halala',
    enSubPlural: 'Halalas',
  },
  SDG: {
    arMain: 'جنيه سوداني',
    arMainDual: 'جنيهان سودانيان',
    arMainPlural: 'جنيهات سودانية',
    arSub: 'قرش',
    arSubPlural: 'قروش',
    enMain: 'Sudanese Pound',
    enMainPlural: 'Sudanese Pounds',
    enSub: 'Piaster',
    enSubPlural: 'Piasters',
  },
  EUR: {
    arMain: 'يورو',
    arMainDual: 'يورو',
    arMainPlural: 'يورو',
    arSub: 'سنت',
    arSubPlural: 'سنتات',
    enMain: 'Euro',
    enMainPlural: 'Euros',
    enSub: 'Cent',
    enSubPlural: 'Cents',
  },
  GBP: {
    arMain: 'جنيه إسترليني',
    arMainDual: 'جنيهان إسترلينيان',
    arMainPlural: 'جنيهات إسترلينية',
    arSub: 'بنس',
    arSubPlural: 'بنسات',
    enMain: 'British Pound',
    enMainPlural: 'British Pounds',
    enSub: 'Penny',
    enSubPlural: 'Pence',
  },
  QAR: {
    arMain: 'ريال قطري',
    arMainDual: 'ريالان قطريان',
    arMainPlural: 'ريالات قطرية',
    arSub: 'درهم',
    arSubPlural: 'دراهم',
    enMain: 'Qatari Riyal',
    enMainPlural: 'Qatari Riyals',
    enSub: 'Dirham',
    enSubPlural: 'Dirhams',
  },
  KWD: {
    arMain: 'دينار كويتي',
    arMainDual: 'ديناران كويتيان',
    arMainPlural: 'دنانير كويتية',
    arSub: 'فلس',
    arSubPlural: 'فلس',
    enMain: 'Kuwaiti Dinar',
    enMainPlural: 'Kuwaiti Dinars',
    enSub: 'Fil',
    enSubPlural: 'Fils',
  },
  OMR: {
    arMain: 'ريال عماني',
    arMainDual: 'ريالان عمانيان',
    arMainPlural: 'ريالات عمانية',
    arSub: 'بيسة',
    arSubPlural: 'بيسات',
    enMain: 'Omani Rial',
    enMainPlural: 'Omani Rials',
    enSub: 'Baisa',
    enSubPlural: 'Baisas',
  },
  BHD: {
    arMain: 'دينار بحريني',
    arMainDual: 'ديناران بحرينيان',
    arMainPlural: 'دنانير بحرينية',
    arSub: 'فلس',
    arSubPlural: 'فلس',
    enMain: 'Bahraini Dinar',
    enMainPlural: 'Bahraini Dinars',
    enSub: 'Fil',
    enSubPlural: 'Fils',
  },
};

function convertArabicHundreds(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];

  const h = Math.floor(n / 100);
  const remainder = n % 100;

  if (h > 0) parts.push(AR_HUNDREDS[h]);

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(AR_ONES[remainder]);
    } else {
      const ones = remainder % 10;
      const tens = Math.floor(remainder / 10);
      if (ones > 0) {
        parts.push(AR_ONES[ones] + ' و' + AR_TENS[tens]);
      } else {
        parts.push(AR_TENS[tens]);
      }
    }
  }

  return parts.join(' و');
}

export function numberToArabicWords(num: number): string {
  if (num === 0) return 'صفر';
  if (num < 0) return 'سالب ' + numberToArabicWords(Math.abs(num));

  const parts: string[] = [];

  const billions = Math.floor(num / 1_000_000_000);
  let rem = num % 1_000_000_000;

  const millions = Math.floor(rem / 1_000_000);
  rem = rem % 1_000_000;

  const thousands = Math.floor(rem / 1_000);
  const ones = rem % 1_000;

  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(convertArabicHundreds(billions) + ' مليارات');
    else parts.push(convertArabicHundreds(billions) + ' مليار');
  }

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(convertArabicHundreds(millions) + ' ملايين');
    else parts.push(convertArabicHundreds(millions) + ' مليون');
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(convertArabicHundreds(thousands) + ' آلاف');
    else parts.push(convertArabicHundreds(thousands) + ' ألف');
  }

  if (ones > 0) {
    parts.push(convertArabicHundreds(ones));
  }

  return parts.join(' و');
}

function convertEnglishHundreds(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const remainder = n % 100;

  if (h > 0) {
    parts.push(EN_ONES[h] + ' Hundred');
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(EN_ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(EN_TENS[tens] + (ones > 0 ? '-' + EN_ONES[ones] : ''));
    }
  }

  return parts.join(' and ');
}

export function numberToEnglishWords(num: number): string {
  if (num === 0) return 'Zero';
  if (num < 0) return 'Negative ' + numberToEnglishWords(Math.abs(num));

  const parts: string[] = [];

  const billions = Math.floor(num / 1_000_000_000);
  let rem = num % 1_000_000_000;

  const millions = Math.floor(rem / 1_000_000);
  rem = rem % 1_000_000;

  const thousands = Math.floor(rem / 1_000);
  const ones = rem % 1_000;

  if (billions > 0) {
    parts.push(convertEnglishHundreds(billions) + ' Billion');
  }
  if (millions > 0) {
    parts.push(convertEnglishHundreds(millions) + ' Million');
  }
  if (thousands > 0) {
    parts.push(convertEnglishHundreds(thousands) + ' Thousand');
  }
  if (ones > 0) {
    parts.push(convertEnglishHundreds(ones));
  }

  return parts.join(', ');
}

/**
 * Returns formatted currency amount in words.
 * Example (AR): "فقط خمسمائة دولار أمريكي لا غير"
 * Example (EN): "Only Five Hundred US Dollars"
 */
export function amountInWords(
  amount: number,
  currency: string = 'USD',
  lang: 'ar' | 'en' | 'bilingual' = 'ar'
): string {
  const safeAmount = Math.abs(Number(amount) || 0);
  const intPart = Math.floor(safeAmount);
  const decPart = Math.round((safeAmount - intPart) * 100);

  const cfg = CURRENCY_CONFIG[currency] || {
    arMain: currency,
    arMainDual: currency,
    arMainPlural: currency,
    arSub: 'سنت',
    arSubPlural: 'سنتات',
    enMain: currency,
    enMainPlural: currency,
    enSub: 'Cent',
    enSubPlural: 'Cents',
  };

  if (lang === 'en') {
    let mainWord = intPart === 1 ? cfg.enMain : cfg.enMainPlural;
    let res = `${numberToEnglishWords(intPart)} ${mainWord}`;
    if (decPart > 0) {
      let subWord = decPart === 1 ? cfg.enSub : cfg.enSubPlural;
      res += ` and ${numberToEnglishWords(decPart)} ${subWord}`;
    }
    return `Only ${res}`;
  }

  // Arabic or Bilingual
  let curName = cfg.arMain;
  if (intPart === 2) curName = cfg.arMainDual;
  else if (intPart >= 3 && intPart <= 10) curName = cfg.arMainPlural;

  let res = `${numberToArabicWords(intPart)} ${curName}`;
  if (decPart > 0) {
    let subName = decPart >= 3 && decPart <= 10 ? cfg.arSubPlural : cfg.arSub;
    res += ` و${numberToArabicWords(decPart)} ${subName}`;
  }
  return `فقط ${res} لا غير`;
}
