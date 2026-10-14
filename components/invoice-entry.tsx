'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Trash2, Printer, Save, RefreshCw, Eye, Edit3, ArrowRight, FileText, CheckCircle2 } from 'lucide-react';
import { ERPIcon } from '@/components/erp-icons';
import { SearchablePicker } from '@/components/searchable-picker';
import { AgencyLetterhead, AgencyReportFooter } from '@/components/agency-letterhead';
import { useAgencySettings, useAgencyAccess } from '@/components/access-context';
import { WhatsAppDialog } from '@/components/whatsapp-dialog';
import { buildInvoiceWhatsAppMessage, openWhatsAppDirect } from '@/lib/whatsapp';
import { amountInWords } from '@/lib/number-words';
import { money, today, type RecordRow } from '@/lib/domain';
import { toast } from 'sonner';
import { extractInvoiceItemsFromTicket } from '@/lib/ticket-extractor';

export interface InvoiceItem {
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

export interface InvoiceEntryProps {
  initial?: any;
  initialCustomerId?: string;
  initialTicketId?: string;
  onSaved?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}


export function InvoiceEntry({
  initial,
  initialCustomerId,
  initialTicketId,
  onSaved,
  onCancel,
  onClose,
}: InvoiceEntryProps) {
  const settings = useAgencySettings();
  const access = useAgencyAccess();
  const canManage = access.modules.customers === 'manage';

  // API Data
  const [customers, setCustomers] = useState<RecordRow[]>([]);
  const [tickets, setTickets] = useState<RecordRow[]>([]);
  const [existingInvoices, setExistingInvoices] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initial?.payload?.customerId || initialCustomerId || ''
  );
  const [selectedTicketPicker, setSelectedTicketPicker] = useState<string>('');
  const [filterCustomerTicketsOnly, setFilterCustomerTicketsOnly] = useState<boolean>(true);

  // Billed To & Addressee details (Editable by user)
  const [billedTo, setBilledTo] = useState<string>(
    initial?.payload?.billedTo || initial?.name || ''
  );
  const [billedToTaxNumber, setBilledToTaxNumber] = useState<string>(
    initial?.payload?.billedToTaxNumber || ''
  );
  const [billedToAddress, setBilledToAddress] = useState<string>(
    initial?.payload?.billedToAddress || ''
  );
  const [billedToPhone, setBilledToPhone] = useState<string>(
    initial?.payload?.billedToPhone || ''
  );
  const [billedToEmail, setBilledToEmail] = useState<string>(
    initial?.payload?.billedToEmail || ''
  );
  const [attention, setAttention] = useState<string>(
    initial?.payload?.attention || ''
  );

  // Invoice Details
  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    initial?.code || ''
  );
  const [invoiceDate, setInvoiceDate] = useState<string>(
    initial?.date || today()
  );
  const [dueDate, setDueDate] = useState<string>(
    initial?.payload?.dueDate || today()
  );
  const [currency, setCurrency] = useState<string>(
    initial?.currency || settings.defaultCurrency || 'USD'
  );
  const [language, setLanguage] = useState<'ar' | 'en' | 'bilingual'>(
    initial?.payload?.language || 'ar'
  );
  const [invoiceType, setInvoiceType] = useState<'proforma' | 'tax' | 'standard'>(
    initial?.payload?.invoiceType || 'tax'
  );

  // Items
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (initial?.payload?.items && Array.isArray(initial.payload.items) && initial.payload.items.length > 0) {
      return initial.payload.items;
    }
    if (initial?.kind === 'ticket' || initial?.payload?.passengers) {
      return extractInvoiceItemsFromTicket(initial, today());
    }
    return [
      {
        id: crypto.randomUUID(),
        ticketNo: initial?.payload?.ticketCode || initial?.code || '',
        passengerName: initial?.payload?.passengerName || '',
        airline: initial?.payload?.airline || '',
        route: initial?.payload?.route || '',
        flightDate: initial?.payload?.flightDate || today(),
        fare: Number(initial?.payload?.fare || 0),
        taxes: Number(initial?.payload?.taxes || 0),
        total: initial?.amount ? Math.abs(initial.amount) / 100 : 0,
      },
    ];
  });

  const [discount, setDiscount] = useState<number>(
    Number(initial?.payload?.discount || 0)
  );
  const [taxRate, setTaxRate] = useState<number>(
    Number(initial?.payload?.taxRate || 0)
  );
  const [notes, setNotes] = useState<string>(
    initial?.payload?.notes ||
      (settings.reportFooter
        ? settings.reportFooter
        : 'شكراً لتعاملكم معنا. يرجى سداد قيمة الفاتورة للحساب البنكي المعتمد.')
  );
  const [bankDetails, setBankDetails] = useState<string>(
    initial?.payload?.bankDetails || ''
  );

  // UI State
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, tRes, invRes] = await Promise.all([
        fetch('/api/records?kind=customer').then((r) => r.json()).catch(() => []),
        fetch('/api/records?kind=ticket').then((r) => r.json()).catch(() => []),
        fetch('/api/records?kind=invoice').then((r) => r.json()).catch(() => []),
      ]);
      setCustomers(Array.isArray(cRes) ? cRes : []);
      setTickets(Array.isArray(tRes) ? tRes : []);
      setExistingInvoices(Array.isArray(invRes) ? invRes : []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Generate Auto-Increment Invoice Number if new
  useEffect(() => {
    if (!invoiceNumber && existingInvoices.length >= 0) {
      let maxNum = 0;
      for (const inv of existingInvoices) {
        const raw = inv.code || '';
        const match = raw.match(/(\d+)/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
      const nextNum = maxNum + 1;
      const year = new Date().getFullYear();
      setInvoiceNumber(`INV-${year}-${String(nextNum).padStart(4, '0')}`);
    }
  }, [existingInvoices, invoiceNumber]);

  // Initial Ticket Hook if supplied
  useEffect(() => {
    if (initialTicketId && tickets.length > 0 && (!items[0]?.ticketNo || items[0]?.ticketNo === '')) {
      const found = tickets.find((t) => t.id === initialTicketId);
      if (found) {
        handleTicketSelect(found.id, tickets);
      }
    }
  }, [initialTicketId, tickets]);

  // Customer Selection Handler: auto-populates Billed-To and addresses
  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find((c) => c.id === custId);
    if (!cust) return;

    // If billedTo is empty or matches previous customer, update to this customer's name
    setBilledTo((prev) => (!prev || customers.some((c) => c.name === prev) ? cust.name : prev));

    if (cust.payload?.address && !billedToAddress) {
      setBilledToAddress(cust.payload.address);
    }
    if (cust.payload?.phone && !billedToPhone) {
      setBilledToPhone(cust.payload.phone);
    }
    if (cust.payload?.email && !billedToEmail) {
      setBilledToEmail(cust.payload.email);
    }
    if ((cust.payload?.taxNumber || cust.payload?.vatNumber) && !billedToTaxNumber) {
      setBilledToTaxNumber(cust.payload.taxNumber || cust.payload.vatNumber);
    }
  };

  // Ticket Selection Handler: extracts all passengers and auto-populates invoice items with divided pricing
  const handleTicketSelect = (tktId: string, ticketList = tickets) => {
    if (!tktId) return;
    const tkt = ticketList.find((t) => t.id === tktId);
    if (!tkt) return;

    const p = tkt.payload || {};
    const newItems = extractInvoiceItemsFromTicket(tkt, today());

    // If customer wasn't selected yet, auto-select customer from ticket
    if (!selectedCustomerId && p.customerId) {
      handleCustomerSelect(p.customerId);
    } else if (!billedTo && p.customerName) {
      setBilledTo(p.customerName);
    }

    // Set currency if currently default
    if (tkt.currency) {
      setCurrency(tkt.currency);
    }

    // Replace first row if it's empty, or append if rows already exist
    setItems((prev) => {
      const isFirstEmpty =
        prev.length === 1 && !prev[0].ticketNo && !prev[0].passengerName && prev[0].total === 0;
      if (isFirstEmpty) {
        return newItems;
      }
      // Check if ticket already added
      if (prev.some((it) => it.ticketId === tkt.id)) {
        toast.info('التذكرة مضافة بالفعل في قائمة بنود الفاتورة');
        return prev;
      }
      return [...prev, ...newItems];
    });

    setSelectedTicketPicker('');
    if (newItems.length > 1) {
      toast.success(
        `تم استيراد تذكرة ${tkt.code} وإضافة جميع الركاب (${newItems.length} ركاب) مع تقسيم السعر بالتساوي`
      );
    } else {
      toast.success(`تم استيراد بيانات التذكرة ${tkt.code} آلياً`);
    }
  };

  // Item Table Actions
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ticketNo: '',
        passengerName: '',
        airline: '',
        route: '',
        flightDate: today(),
        fare: 0,
        taxes: 0,
        total: 0,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      toast.error('يجب أن تحتوي الفاتورة على بند واحد على الأقل');
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };
        if (field === 'fare' || field === 'taxes') {
          const f = field === 'fare' ? Number(value || 0) : Number(it.fare || 0);
          const tx = field === 'taxes' ? Number(value || 0) : Number(it.taxes || 0);
          updated.total = f + tx;
        }
        return updated;
      })
    );
  };

  // Calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  }, [items]);

  const afterDiscount = useMemo(() => {
    return Math.max(0, subtotal - (Number(discount) || 0));
  }, [subtotal, discount]);

  const taxAmount = useMemo(() => {
    if (taxRate <= 0) return 0;
    return (afterDiscount * taxRate) / 100;
  }, [afterDiscount, taxRate]);

  const grandTotal = useMemo(() => {
    return afterDiscount + taxAmount;
  }, [afterDiscount, taxAmount]);

  // Amount in words
  const totalInWords = useMemo(() => {
    return amountInWords(grandTotal, currency, language);
  }, [grandTotal, currency, language]);

  // Filtered tickets options for Picker
  const availableTickets = useMemo(() => {
    if (filterCustomerTicketsOnly && selectedCustomerId) {
      return tickets.filter((t) => t.payload?.customerId === selectedCustomerId);
    }
    return tickets;
  }, [tickets, selectedCustomerId, filterCustomerTicketsOnly]);

  // Save to database
  const handleSaveInvoice = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!billedTo.trim()) {
      toast.error('يرجى إدخال اسم الجهة الموجهة لها الفاتورة');
      return;
    }
    if (!invoiceNumber.trim()) {
      toast.error('يرجى تحديد رقم الفاتورة');
      return;
    }
    if (items.length === 0 || grandTotal <= 0) {
      toast.error('يجب أن تحتوي الفاتورة على بنود ومبلغ إجمالي صحيح');
      return;
    }

    setBusy(true);
    try {
      const selectedCust = customers.find((c) => c.id === selectedCustomerId);

      const payload = {
        customerId: selectedCustomerId || undefined,
        customerName: selectedCust?.name || billedTo,
        billedTo,
        billedToTaxNumber,
        billedToAddress,
        billedToPhone,
        billedToEmail,
        attention,
        language,
        invoiceType,
        ticketId: items[0]?.ticketId || undefined,
        ticketCode: items[0]?.ticketNo || undefined,
        passengerName: items[0]?.passengerName || undefined,
        airline: items[0]?.airline || undefined,
        route: items[0]?.route || undefined,
        flightDate: items[0]?.flightDate || undefined,
        pnr: items[0]?.pnr || undefined,
        items,
        subtotal,
        discount,
        taxRate,
        taxAmount,
        dueDate,
        notes,
        bankDetails,
      };

      const recordBody = {
        id: initial?.id,
        kind: 'invoice',
        name: billedTo,
        code: invoiceNumber,
        date: invoiceDate,
        currency,
        amount: grandTotal,
        payload,
      };

      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordBody),
      });

      if (!res.ok) {
        const errJson: any = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || 'فشل في حفظ الفاتورة');
      }

      toast.success('تم حفظ الفاتورة بنجاح في سجلات النظام');
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء حفظ الفاتورة');
    } finally {
      setBusy(false);
    }
  };

  // WhatsApp Message
  const waMessage = useMemo(() => {
    return buildInvoiceWhatsAppMessage({
      invoiceCode: invoiceNumber,
      billedTo,
      customerName: customers.find((c) => c.id === selectedCustomerId)?.name,
      date: invoiceDate,
      dueDate,
      totalAmount: grandTotal,
      currency,
      passengerName: items[0]?.passengerName,
      ticketCode: items[0]?.ticketNo,
      airline: items[0]?.airline,
      route: items[0]?.route,
      flightDate: items[0]?.flightDate,
      language,
      invoiceType,
      itemsCount: items.length,
      settings,
    });
  }, [
    invoiceNumber,
    billedTo,
    selectedCustomerId,
    customers,
    invoiceDate,
    dueDate,
    grandTotal,
    currency,
    items,
    language,
    invoiceType,
    settings,
  ]);

  // Labels based on Language
  const isEn = language === 'en';
  const isBi = language === 'bilingual';
  const isAr = language === 'ar';

  const typeHeaderTitle =
    invoiceType === 'tax'
      ? isEn
        ? 'TAX INVOICE'
        : isBi
        ? 'فاتورة ضريبية / TAX INVOICE'
        : 'فاتورة ضريبية'
      : invoiceType === 'proforma'
      ? isEn
        ? 'PROFORMA INVOICE'
        : isBi
        ? 'فاتورة مبدئية / PROFORMA INVOICE'
        : 'فاتورة مبدئية'
      : isEn
      ? 'SALES INVOICE'
      : isBi
      ? 'فاتورة مبيعات / SALES INVOICE'
      : 'فاتورة مبيعات';

  return (
    <div className="invoice-workspace-container" dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Action & Mode Navigation */}
      <div
        className="invoice-header-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ERPIcon name="invoice" size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
              {initial?.id ? 'تعديل الفاتورة' : 'إصدار وتوليد الفاتورة آلياً'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
              حدد العميل والتذكرة، وسيقوم النظام بتعبئة بنود وأسعار الفاتورة وتنسيقها حسب لغة الطباعة
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Tab Switcher */}
          <div
            style={{
              display: 'inline-flex',
              background: '#e2e8f0',
              padding: '3px',
              borderRadius: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'form' ? '#ffffff' : 'transparent',
                color: activeTab === 'form' ? '#0f172a' : '#64748b',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'form' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Edit3 size={15} />
              بيانات الفاتورة
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'preview' ? '#ffffff' : 'transparent',
                color: activeTab === 'preview' ? '#0f172a' : '#64748b',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'preview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Eye size={15} />
              معاينة وطباعة A4
            </button>
          </div>

          {/* Quick Print Button */}
          <button
            type="button"
            className="plain-button"
            onClick={() => {
              setActiveTab('preview');
              setTimeout(() => window.print(), 100);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
            title="طباعة الفاتورة على ورق A4"
          >
            <Printer size={16} />
            طباعة الفاتورة
          </button>

          {/* WhatsApp Button */}
          <button
            type="button"
            className="plain-button"
            onClick={() => setWhatsAppModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              color: '#16a34a',
              borderColor: '#bbf7d0',
              background: '#f0fdf4',
            }}
            title="إرسال الفاتورة للعميل عبر WhatsApp"
          >
            <ERPIcon name="whatsapp" size={16} />
            إرسال عبر WhatsApp
          </button>

          {/* Save Button */}
          <button
            type="button"
            className="blue-button"
            disabled={busy || !canManage}
            onClick={() => handleSaveInvoice()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            <Save size={16} />
            {busy ? 'جارٍ الحفظ…' : 'حفظ الفاتورة'}
          </button>

          {onCancel && (
            <button type="button" className="plain-button" onClick={onCancel}>
              إلغاء
            </button>
          )}
        </div>
      </div>

      {/* Main View Body */}
      {activeTab === 'form' ? (
        <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* STEP 1: Select Customer & Select Ticket (The Automation Hub) */}
          <section
            style={{
              background: '#ffffff',
              border: '2px solid #3b82f6',
              borderRadius: '12px',
              padding: '18px 20px',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
                >
                  1
                </span>
                <strong style={{ fontSize: '15px', color: '#1e3a8a' }}>
                  تحديد العميل والتذكرة (تعبئة الفاتورة آلياً ⚡)
                </strong>
              </div>
              <span style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 600 }}>
                💡 باختيار التذكرة، يتم سحب بيانات المسافر والرحلة والأسعار تلقائياً
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* Customer Picker */}
              <div>
                <SearchablePicker
                  label="اختر العميل (Customer)"
                  value={selectedCustomerId}
                  onChange={handleCustomerSelect}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} ${c.payload?.phone ? `(${c.payload.phone})` : ''}`,
                  }))}
                  placeholder="اختر أو ابحث باسم العميل..."
                  searchPlaceholder="ابحث باسم العميل أو رقمه..."
                  dir="rtl"
                />
              </div>

              {/* Ticket Picker */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    اختر التذكرة (Ticket)
                  </label>
                  {selectedCustomerId && (
                    <label style={{ fontSize: '11px', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="checkbox"
                        checked={filterCustomerTicketsOnly}
                        onChange={(e) => setFilterCustomerTicketsOnly(e.target.checked)}
                      />
                      تذاكر هذا العميل فقط ({availableTickets.length})
                    </label>
                  )}
                </div>
                <SearchablePicker
                  value={selectedTicketPicker}
                  onChange={(val) => handleTicketSelect(val)}
                  options={availableTickets.map((t) => ({
                    value: t.id,
                    label: `${t.code} · ${t.name} · ${t.payload?.airline || ''} (${t.currency} ${money(t.amount)})`,
                  }))}
                  placeholder="اختر التذكرة لاستيراد بياناتها آلياً..."
                  searchPlaceholder="ابحث برقم التذكرة، اسم المسافر، خط السير..."
                  dir="rtl"
                />
              </div>
            </div>
          </section>

          {/* STEP 2: Billed To / Addressee & Language Settings */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span
                style={{
                  background: '#0f766e',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 'bold',
                }}
              >
                2
              </span>
              <strong style={{ fontSize: '15px', color: '#0f766e' }}>
                الجهة الموجهة لها الفاتورة وخيارات اللغة والتنسيق
              </strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              {/* Customizable Billed-To Name (Requested by user) */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  اسم الجهة الموجهة لها الفاتورة (Billed To / Messrs) *
                </label>
                <input
                  type="text"
                  required
                  value={billedTo}
                  onChange={(e) => setBilledTo(e.target.value)}
                  placeholder="مثال: شركة النيل للتجارة، أو وزارة الخارجية، أو اسم المسافر..."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '2px solid #cbd5e1',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    background: '#f8fafc',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                  onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                />
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  ✏️ يمكنك تغيير اسم الجهة بحرية تامة ليطابق اسم الشركة أو المؤسسة أو الجهة المطلوب توجيه الفاتورة إليها
                </span>
              </div>

              {/* Language Switcher (Requested by user) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  لغة الفاتورة ومحاذاة الجداول (Language)
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { key: 'ar', label: 'العربية (RTL)' },
                    { key: 'en', label: 'English (LTR)' },
                    { key: 'bilingual', label: 'ثنائي اللغة (Bilingual)' },
                  ].map((lang) => (
                    <button
                      key={lang.key}
                      type="button"
                      onClick={() => setLanguage(lang.key as any)}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: language === lang.key ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: language === lang.key ? '#eff6ff' : '#ffffff',
                        color: language === lang.key ? '#1d4ed8' : '#475569',
                        fontWeight: language === lang.key ? 700 : 500,
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Invoice Type */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  نوع الفاتورة (Invoice Type)
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#fff',
                  }}
                >
                  <option value="tax">فاتورة ضريبية (Tax Invoice)</option>
                  <option value="proforma">فاتورة مبدئية (Proforma Invoice)</option>
                  <option value="standard">فاتورة مبيعات عادية (Sales Invoice)</option>
                </select>
              </div>

              {/* Invoice Number */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  رقم الفاتورة (Invoice No.)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  تاريخ الفاتورة (Date)
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Due Date */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  تاريخ الاستحقاق (Due Date)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Currency */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  العملة (Currency)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD, EGP, AED, SAR..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                />
              </div>

              {/* Client Tax / VAT Number */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  الرقم الضريبي للجهة (Tax / VAT No.)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={billedToTaxNumber}
                  onChange={(e) => setBilledToTaxNumber(e.target.value)}
                  placeholder="مثال: 3001234567890"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Attention / عناية */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  عناية (Attn / Contact Person)
                </label>
                <input
                  type="text"
                  value={attention}
                  onChange={(e) => setAttention(e.target.value)}
                  placeholder="مثال: السيد / مدير الحسابات"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Phone & Address */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  الهاتف (Phone)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={billedToPhone}
                  onChange={(e) => setBilledToPhone(e.target.value)}
                  placeholder="+20 100 000 0000"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  العنوان (Address)
                </label>
                <input
                  type="text"
                  value={billedToAddress}
                  onChange={(e) => setBilledToAddress(e.target.value)}
                  placeholder="المدينة، الشارع، المبنى..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>
          </section>

          {/* STEP 3: Invoice Items Table */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: '#6366f1',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
                >
                  3
                </span>
                <strong style={{ fontSize: '15px', color: '#4338ca' }}>
                  بنود الفاتورة والتذاكر (Items & Tickets)
                </strong>
              </div>

              <button
                type="button"
                className="plain-button"
                onClick={handleAddItem}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <Plus size={14} />
                إضافة بند يدوي
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <tr>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: '36px' }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>اسم المسافر / البند</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>رقم التذكرة</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>الخطوط</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>خط السير</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>تاريخ السفر</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', width: '90px' }}>السعر الأساسي</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', width: '90px' }}>الضرائب</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', width: '110px' }}>الإجمالي</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: '40px' }}>حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          value={it.passengerName}
                          onChange={(e) => handleUpdateItem(it.id, 'passengerName', e.target.value)}
                          placeholder="اسم المسافر"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          dir="ltr"
                          value={it.ticketNo}
                          onChange={(e) => handleUpdateItem(it.id, 'ticketNo', e.target.value)}
                          placeholder="رقم التذكرة"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontFamily: 'monospace' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          value={it.airline}
                          onChange={(e) => handleUpdateItem(it.id, 'airline', e.target.value)}
                          placeholder="الخطوط"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="text"
                          dir="ltr"
                          value={it.route}
                          onChange={(e) => handleUpdateItem(it.id, 'route', e.target.value)}
                          placeholder="CAI-DXB"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="date"
                          value={it.flightDate}
                          onChange={(e) => handleUpdateItem(it.id, 'flightDate', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="number"
                          dir="ltr"
                          value={it.fare || ''}
                          onChange={(e) => handleUpdateItem(it.id, 'fare', e.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="number"
                          dir="ltr"
                          value={it.taxes || ''}
                          onChange={(e) => handleUpdateItem(it.id, 'taxes', e.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input
                          type="number"
                          dir="ltr"
                          value={it.total || ''}
                          onChange={(e) => handleUpdateItem(it.id, 'total', e.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #94a3b8', textAlign: 'right', fontWeight: 600, background: '#f8fafc' }}
                        />
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="danger-text"
                          onClick={() => handleRemoveItem(it.id)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}
                          title="حذف البند"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Calculations */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '20px',
                marginTop: '16px',
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  ملاحظات وتعليمات السداد (Bank Details / Notes)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="شروط الدفع، رقم الحساب البنكي، أو تعليمات التحويل..."
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>المجموع الفرعي (Subtotal):</span>
                  <strong dir="ltr" style={{ fontSize: '14px', color: '#0f172a' }}>
                    {money(Math.round(subtotal * 100))} {currency}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>الخصم (Discount):</span>
                  <input
                    type="number"
                    dir="ltr"
                    value={discount || ''}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    placeholder="0"
                    style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>نسبة الضريبة (VAT %):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      dir="ltr"
                      value={taxRate || ''}
                      onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                      placeholder="0"
                      style={{ width: '60px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: '12px', color: '#64748b' }}>%</span>
                    <span dir="ltr" style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>
                      ({money(Math.round(taxAmount * 100))})
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '2px solid #cbd5e1',
                    paddingTop: '8px',
                    marginTop: '4px',
                  }}
                >
                  <strong style={{ fontSize: '16px', color: '#1e3a8a' }}>المجموع الكلي المطلوب:</strong>
                  <strong dir="ltr" style={{ fontSize: '18px', color: '#1e3a8a' }}>
                    {money(Math.round(grandTotal * 100))} {currency}
                  </strong>
                </div>

                {/* Amount in Words */}
                <div style={{ background: '#eff6ff', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', color: '#1e40af' }}>
                  <strong>المبلغ كتابةً: </strong> {totalInWords}
                </div>
              </div>
            </div>
          </section>

          {/* Form Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="plain-button"
              onClick={() => setActiveTab('preview')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Eye size={16} />
              معاينة الفاتورة قبل الحفظ
            </button>
            <button
              type="submit"
              className="blue-button"
              disabled={busy || !canManage}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={16} />
              {busy ? 'جارٍ الحفظ…' : 'حفظ الفاتورة في النظام'}
            </button>
          </div>
        </form>
      ) : (
        /* TAB 2: Live A4 Printable Invoice Sheet Preview */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quick Toolbar above A4 Preview */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f1f5f9',
              padding: '10px 16px',
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>اللغة:</span>
              <button
                type="button"
                onClick={() => setLanguage('ar')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: language === 'ar' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  background: language === 'ar' ? '#eff6ff' : '#fff',
                  fontWeight: language === 'ar' ? 700 : 400,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                عربي (RTL)
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: language === 'en' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  background: language === 'en' ? '#eff6ff' : '#fff',
                  fontWeight: language === 'en' ? 700 : 400,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                English (LTR)
              </button>
              <button
                type="button"
                onClick={() => setLanguage('bilingual')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: language === 'bilingual' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  background: language === 'bilingual' ? '#eff6ff' : '#fff',
                  fontWeight: language === 'bilingual' ? 700 : 400,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                ثنائي اللغة (Bilingual)
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="plain-button"
                onClick={() => setActiveTab('form')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Edit3 size={15} />
                تعديل البيانات
              </button>
              <button
                type="button"
                className="blue-button"
                onClick={() => window.print()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={15} />
                طباعة الفاتورة الآن (Print A4)
              </button>
            </div>
          </div>

          {/* Printable A4 Paper Container */}
          <div
            className="invoice-print-area"
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '20px 0',
              background: '#525659',
              borderRadius: '8px',
              overflowX: 'auto',
            }}
          >
            <article
              id="invoice-print-sheet"
              dir={isEn ? 'ltr' : 'rtl'}
              style={{
                width: '210mm',
                minHeight: '297mm',
                background: '#ffffff',
                color: '#0f172a',
                padding: '16mm 18mm',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                boxSizing: 'border-box',
                fontFamily: isEn
                  ? 'Inter, system-ui, -apple-system, sans-serif'
                  : 'Cairo, Tajawal, system-ui, sans-serif',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* 1. Header / Letterhead */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    borderBottom: '2px solid #1e3a8a',
                    paddingBottom: '16px',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 800, color: '#1e3a8a' }}>
                      {settings.companyName || 'وكالة السفر والسياحة'}
                    </h1>
                    <p style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>
                      {isEn ? 'Phone: ' : 'الهاتف: '}
                      <b dir="ltr">{settings.phones}</b>
                    </p>
                    {settings.address && (
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>
                        {isEn ? 'Address: ' : 'العنوان: '}
                        {settings.address}
                      </p>
                    )}
                    {settings.agencyEmail && (
                      <p dir="ltr" style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>
                        {settings.agencyEmail}
                      </p>
                    )}
                    {settings.taxNumber && (
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>
                        {isEn ? 'Tax / VAT Reg: ' : 'الرقم الضريبي: '}
                        <b dir="ltr">{settings.taxNumber}</b>
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: isEn ? 'right' : 'left' }}>
                    {settings.logoKey ? (
                      <img
                        src={`/api/agency/logo?v=${encodeURIComponent(settings.logoKey)}`}
                        alt="Logo"
                        style={{ maxHeight: '65px', maxWidth: '160px', objectFit: 'contain' }}
                      />
                    ) : (
                      <div
                        style={{
                          padding: '10px 16px',
                          background: '#eff6ff',
                          borderRadius: '8px',
                          border: '1px solid #bfdbfe',
                          textAlign: 'center',
                        }}
                      >
                        <strong style={{ fontSize: '16px', color: '#1e40af', display: 'block' }}>
                          {settings.systemName}
                        </strong>
                        <small style={{ fontSize: '10px', color: '#3b82f6', letterSpacing: '1px' }}>
                          TRAVEL & FINANCE
                        </small>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Document Title Banner */}
                <div
                  style={{
                    background: '#1e3a8a',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, letterSpacing: isEn ? '1px' : '0' }}>
                    {typeHeaderTitle}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px' }}>
                    <span>
                      {isEn ? 'Invoice No: ' : isBi ? 'رقم الفاتورة / No: ' : 'رقم الفاتورة: '}
                      <b dir="ltr" style={{ color: '#fde047' }}>
                        {invoiceNumber}
                      </b>
                    </span>
                    <span>
                      {isEn ? 'Date: ' : isBi ? 'التاريخ / Date: ' : 'التاريخ: '}
                      <b dir="ltr">{invoiceDate}</b>
                    </span>
                  </div>
                </div>

                {/* 3. Billed-To Box & Meta */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1fr',
                    gap: '16px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    marginBottom: '18px',
                  }}
                >
                  {/* Billed To Box */}
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      {isEn ? 'Billed To (Messrs):' : isBi ? 'المطلوب من السادة / Billed To:' : 'المطلوب من السادة:'}
                    </span>
                    <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                      {billedTo || 'العميل المحترم'}
                    </h3>
                    {attention && (
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#334155' }}>
                        <b>{isEn ? 'Attn: ' : isBi ? 'عناية / Attn: ' : 'عناية: '}</b>
                        {attention}
                      </p>
                    )}
                    {billedToAddress && (
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>
                        <b>{isEn ? 'Address: ' : isBi ? 'العنوان / Address: ' : 'العنوان: '}</b>
                        {billedToAddress}
                      </p>
                    )}
                    {billedToTaxNumber && (
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>
                        <b>{isEn ? 'Tax ID / TRN: ' : isBi ? 'الرقم الضريبي / Tax ID: ' : 'الرقم الضريبي: '}</b>
                        <span dir="ltr">{billedToTaxNumber}</span>
                      </p>
                    )}
                    {billedToPhone && (
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#475569' }}>
                        <b>{isEn ? 'Phone: ' : isBi ? 'الهاتف / Phone: ' : 'الهاتف: '}</b>
                        <span dir="ltr">{billedToPhone}</span>
                      </p>
                    )}
                  </div>

                  {/* Invoice Summary Meta */}
                  <div style={{ borderInlineStart: '1px solid #cbd5e1', paddingInlineStart: '16px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: '3px 0', color: '#64748b', fontWeight: 600 }}>
                            {isEn ? 'Issue Date:' : isBi ? 'تاريخ الإصدار / Date:' : 'تاريخ الإصدار:'}
                          </td>
                          <td dir="ltr" style={{ padding: '3px 0', textAlign: isEn ? 'right' : 'left', fontWeight: 600 }}>
                            {invoiceDate}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '3px 0', color: '#64748b', fontWeight: 600 }}>
                            {isEn ? 'Due Date:' : isBi ? 'تاريخ الاستحقاق / Due:' : 'تاريخ الاستحقاق:'}
                          </td>
                          <td dir="ltr" style={{ padding: '3px 0', textAlign: isEn ? 'right' : 'left', fontWeight: 600 }}>
                            {dueDate}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '3px 0', color: '#64748b', fontWeight: 600 }}>
                            {isEn ? 'Currency:' : isBi ? 'العملة / Currency:' : 'العملة:'}
                          </td>
                          <td style={{ padding: '3px 0', textAlign: isEn ? 'right' : 'left', fontWeight: 700, color: '#1e3a8a' }}>
                            {currency}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '3px 0', color: '#64748b', fontWeight: 600 }}>
                            {isEn ? 'Payment Status:' : isBi ? 'حالة السداد / Status:' : 'حالة الفاتورة:'}
                          </td>
                          <td style={{ padding: '3px 0', textAlign: isEn ? 'right' : 'left', fontWeight: 700, color: '#ea580c' }}>
                            {isEn ? 'Pending / Due' : 'مستحقة السداد'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Table with STRICT Language Alignment */}
                <div style={{ marginBottom: '18px' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      border: '1px solid #cbd5e1',
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#1e3a8a', color: '#ffffff' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: '30px', border: '1px solid #1e3a8a' }}>#</th>
                        <th style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #1e3a8a' }}>
                          {isEn ? 'Passenger Name' : isBi ? 'المسافر / Passenger' : 'المسافر'}
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #1e3a8a' }}>
                          {isEn ? 'Ticket No.' : isBi ? 'رقم التذكرة / Ticket No.' : 'رقم التذكرة'}
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #1e3a8a' }}>
                          {isEn ? 'Airline' : isBi ? 'الخطوط / Airline' : 'الخطوط'}
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #1e3a8a' }}>
                          {isEn ? 'Sector / Route' : isBi ? 'خط السير / Route' : 'خط السير'}
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid #1e3a8a' }}>
                          {isEn ? 'Flight Date' : isBi ? 'تاريخ السفر / Date' : 'تاريخ السفر'}
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: isEn ? 'right' : 'left', border: '1px solid #1e3a8a', width: '75px' }}>
                          {isEn ? 'Fare' : isBi ? 'الأساسي / Fare' : 'الأساسي'}
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: isEn ? 'right' : 'left', border: '1px solid #1e3a8a', width: '75px' }}>
                          {isEn ? 'Taxes' : isBi ? 'الضرائب / Tax' : 'الضرائب'}
                        </th>
                        <th style={{ padding: '8px 10px', textAlign: isEn ? 'right' : 'left', border: '1px solid #1e3a8a', width: '90px' }}>
                          {isEn ? 'Total Amount' : isBi ? 'الإجمالي / Total' : 'الإجمالي'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr
                          key={it.id}
                          style={{
                            background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            borderBottom: '1px solid #cbd5e1',
                          }}
                        >
                          <td style={{ padding: '8px 6px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#64748b' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                            {it.passengerName || '—'}
                          </td>
                          <td dir="ltr" style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #cbd5e1', fontFamily: 'monospace' }}>
                            {it.ticketNo || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #cbd5e1' }}>
                            {it.airline || '—'}
                          </td>
                          <td dir="ltr" style={{ padding: '8px 10px', textAlign: isEn ? 'left' : 'right', border: '1px solid #cbd5e1' }}>
                            {it.route || '—'}
                          </td>
                          <td dir="ltr" style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid #cbd5e1' }}>
                            {it.flightDate || '—'}
                          </td>
                          <td dir="ltr" style={{ padding: '8px 10px', textAlign: isEn ? 'right' : 'left', border: '1px solid #cbd5e1' }}>
                            {money(Math.round(Number(it.fare || 0) * 100))}
                          </td>
                          <td dir="ltr" style={{ padding: '8px 10px', textAlign: isEn ? 'right' : 'left', border: '1px solid #cbd5e1' }}>
                            {money(Math.round(Number(it.taxes || 0) * 100))}
                          </td>
                          <td
                            dir="ltr"
                            style={{
                              padding: '8px 10px',
                              textAlign: isEn ? 'right' : 'left',
                              border: '1px solid #cbd5e1',
                              fontWeight: 700,
                              color: '#0f172a',
                            }}
                          >
                            {money(Math.round(Number(it.total || 0) * 100))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 5. Summary & Totals Block */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr',
                    gap: '20px',
                    alignItems: 'start',
                    marginBottom: '16px',
                  }}
                >
                  {/* Notes & Bank Transfer */}
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '12px 14px',
                      background: '#f8fafc',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                      {isEn ? 'Payment Instructions & Terms:' : isBi ? 'تعليمات السداد / Payment Terms:' : 'تعليمات السداد والملاحظات:'}
                    </span>
                    <p style={{ margin: 0, fontSize: '11px', color: '#334155', whiteSpace: 'pre-line' }}>
                      {notes}
                    </p>
                  </div>

                  {/* Totals Table */}
                  <div
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 12px', color: '#64748b' }}>
                            {isEn ? 'Subtotal:' : isBi ? 'المجموع الفرعي / Subtotal:' : 'المجموع الفرعي:'}
                          </td>
                          <td dir="ltr" style={{ padding: '6px 12px', textAlign: isEn ? 'right' : 'left', fontWeight: 600 }}>
                            {money(Math.round(subtotal * 100))} {currency}
                          </td>
                        </tr>
                        {discount > 0 && (
                          <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#16a34a' }}>
                            <td style={{ padding: '6px 12px' }}>
                              {isEn ? 'Discount:' : isBi ? 'الخصم / Discount:' : 'الخصم:'}
                            </td>
                            <td dir="ltr" style={{ padding: '6px 12px', textAlign: isEn ? 'right' : 'left', fontWeight: 600 }}>
                              - {money(Math.round(discount * 100))} {currency}
                            </td>
                          </tr>
                        )}
                        {taxRate > 0 && (
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px 12px', color: '#64748b' }}>
                              {isEn ? `VAT (${taxRate}%):` : isBi ? `ضريبة القيمة المضافة (${taxRate}%):` : `ضريبة القيمة المضافة (${taxRate}%):`}
                            </td>
                            <td dir="ltr" style={{ padding: '6px 12px', textAlign: isEn ? 'right' : 'left', fontWeight: 600 }}>
                              {money(Math.round(taxAmount * 100))} {currency}
                            </td>
                          </tr>
                        )}
                        <tr style={{ background: '#1e3a8a', color: '#ffffff' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: '13px' }}>
                            {isEn ? 'TOTAL DUE:' : isBi ? 'المجموع الكلي / TOTAL:' : 'المجموع الكلي المطلوب:'}
                          </td>
                          <td
                            dir="ltr"
                            style={{
                              padding: '8px 12px',
                              textAlign: isEn ? 'right' : 'left',
                              fontWeight: 800,
                              fontSize: '15px',
                              color: '#fde047',
                            }}
                          >
                            {money(Math.round(grandTotal * 100))} {currency}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Amount in words */}
                <div
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: '#1e293b',
                    marginBottom: '24px',
                  }}
                >
                  <b>{isEn ? 'Amount in Words: ' : isBi ? 'المبلغ بالحروف / In Words: ' : 'المبلغ بالحروف: '}</b>
                  <span>{totalInWords}</span>
                </div>
              </div>

              {/* 6. Footer & Signatures */}
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '20px',
                    textAlign: 'center',
                    borderTop: '1px dashed #cbd5e1',
                    paddingTop: '16px',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '28px' }}>
                      {isEn ? 'Prepared By' : 'إعداد / المحاسب'}
                    </span>
                    <div style={{ borderBottom: '1px solid #94a3b8', width: '80%', margin: '0 auto' }}></div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '28px' }}>
                      {isEn ? 'Approved By' : 'الاعتماد / المدير'}
                    </span>
                    <div style={{ borderBottom: '1px solid #94a3b8', width: '80%', margin: '0 auto' }}></div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '28px' }}>
                      {isEn ? 'Company Stamp' : 'ختم الوكالة الرسمي'}
                    </span>
                    <div style={{ borderBottom: '1px solid #94a3b8', width: '80%', margin: '0 auto' }}></div>
                  </div>
                </div>

                {settings.reportFooter && (
                  <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>
                    {settings.reportFooter}
                  </p>
                )}
              </div>
            </article>
          </div>
        </div>
      )}

      {/* WhatsApp Dialog */}
      <WhatsAppDialog
        open={whatsAppModalOpen}
        onOpenChange={setWhatsAppModalOpen}
        title="إرسال الفاتورة عبر WhatsApp 📲"
        recipientName={billedTo || 'العميل'}
        initialPhone={billedToPhone}
        initialMessage={waMessage}
      />
    </div>
  );
}
