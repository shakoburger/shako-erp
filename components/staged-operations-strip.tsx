'use client';
import {useState, useEffect, useCallback} from 'react';
import {api} from '@/app/erp-system';
import {money} from '@/lib/domain';
import {FileText, Image as ImageIcon, FileUp, Sparkles, X, ChevronDown, ChevronUp, Download, Eye} from 'lucide-react';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';

export type StagedOp = {
  id: string;
  kind: string;
  code: string;
  name: string;
  date: string;
  currency: string;
  amount: number;
  payload: {
    type: string;
    status: string;
    customerId?: string;
    customerName?: string;
    airline?: string;
    vendor?: string;
    fare?: number;
    sellingPrice?: number;
    supplierPrice?: number;
    commAmount?: number;
    commPct?: number;
    penalties?: number;
    refundComm?: number;
    taxes?: Record<string, number>;
    route?: string;
    class?: string;
    person?: string;
    treasuryId?: string;
    treasuryName?: string;
    counterpartyId?: string;
    counterpartyName?: string;
    crossCurrency?: boolean;
    coveredCurrency?: string;
    coveredAmount?: number;
    conversionRate?: number;
    notes?: string;
    attachment?: {
      name: string;
      type: string;
      size: number;
      data: string;
    } | null;
  };
};

const typeLabels: Record<string, {label: string; color: string; bg: string}> = {
  'ticket-new': {label: 'تذكرة جديدة', color: '#0369a1', bg: '#e0f2fe'},
  'ticket-refund': {label: 'تذكرة مستردة', color: '#c2410c', bg: '#ffedd5'},
  'ticket-void': {label: 'تذكرة ملغاة (فويد)', color: '#b91c1c', bg: '#fee2e2'},
  'bank-transfer': {label: 'تحويل بنكي', color: '#4338ca', bg: '#e0e7ff'},
  'bank-withdraw': {label: 'سحب بنكي', color: '#be185d', bg: '#fce7f3'},
  'bank-deposit': {label: 'إيداع بنكي', color: '#15803d', bg: '#dcfce7'},
  'cash-receipt': {label: 'إستلام نقد', color: '#047857', bg: '#d1fae5'},
  'cash-payment': {label: 'صرف نقد', color: '#9a3412', bg: '#ffedd5'}
};

export function StagedOperationsStrip({
  types,
  onSelect,
  refreshKey,
  title = 'عمليات معلقة بانتظار الإدخال'
}: {
  types: string[];
  onSelect: (op: StagedOp) => void;
  refreshKey?: any;
  title?: string;
}) {
  const [items, setItems] = useState<StagedOp[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const data: StagedOp[] = await api('/api/staged-operations?status=pending');
      const filtered = data.filter(d => types.includes(d.payload?.type));
      setItems(filtered);
    } catch {
      setItems([]);
    }
  }, [types]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!items.length) return null;

  return (
    <div className="staged-strip-container" dir="rtl" style={{
      background: 'linear-gradient(135deg, #f0fdf4 0%, #e6f7ff 100%)',
      border: '1px solid #99f6e4',
      borderRadius: '8px',
      padding: '10px 14px',
      marginBottom: '14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : '10px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f766e',
            color: '#fff',
            borderRadius: '50%',
            width: '24px',
            height: '24px'
          }}>
            <Sparkles size={14} />
          </span>
          <strong style={{fontSize: '14px', color: '#0f766e'}}>
            {title} ({items.length})
          </strong>
          <span style={{fontSize: '12px', color: '#64748b'}}>
            — اضغط على أي عملية لتعبئة بياناتها فوراً، وسيتم حذفها تلقائياً بعد الحفظ لمنع التكرار
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="plain-button"
          style={{fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px'}}
        >
          {collapsed ? <>إظهار <ChevronDown size={14}/></> : <>تصغير <ChevronUp size={14}/></>}
        </button>
      </div>

      {!collapsed && (
        <div style={{
          display: 'flex',
          gap: '10px',
          overflowX: 'auto',
          paddingBottom: '6px'
        }}>
          {items.map(op => {
            const badge = typeLabels[op.payload?.type] || {label: op.payload?.type, color: '#334155', bg: '#f1f5f9'};
            const att = op.payload?.attachment;
            return (
              <div
                key={op.id}
                style={{
                  minWidth: '260px',
                  maxWidth: '320px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
                className="staged-card-item"
                onClick={() => onSelect(op)}
                title="اضغط لتعبئة البيانات في النموذج"
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: badge.color,
                    background: badge.bg,
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    {badge.label}
                  </span>
                  <span style={{fontSize: '11px', color: '#64748b', direction: 'ltr'}}>
                    {op.date}
                  </span>
                </div>

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                  <strong style={{fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px'}}>
                    {op.name}
                  </strong>
                  <span style={{fontSize: '12px', fontWeight: 700, color: '#0f766e', direction: 'ltr'}}>
                    {money(op.amount)} {op.currency}
                  </span>
                </div>

                <div style={{fontSize: '11px', color: '#475569', display: 'flex', justifyContent: 'space-between'}}>
                  <span>رقم: <b dir="ltr">{op.code}</b></span>
                  {op.payload?.customerName && <span>العميل: {op.payload.customerName}</span>}
                </div>

                {(op.payload?.airline || op.payload?.vendor) && (
                  <div style={{fontSize: '11px', color: '#64748b'}}>
                    الخطوط / المورد: <b>{op.payload.airline || op.payload.vendor}</b>
                  </div>
                )}

                {op.payload?.penalties ? (
                  <div style={{fontSize: '11px', color: '#dc2626'}}>
                    الغرامة: <b dir="ltr">{op.payload.penalties} {op.currency}</b>
                  </div>
                ) : null}

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0'}}>
                  <span style={{fontSize: '11px', color: '#0284c7', fontWeight: 600}}>
                    ⚡ انقر لتنزيل البيانات
                  </span>
                  {att && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAttachment(att);
                      }}
                      className="plain-button"
                      style={{fontSize: '11px', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', background: '#eef2ff', borderRadius: '4px'}}
                      title="عرض المرفق"
                    >
                      <Eye size={12}/> مرفق ({att.name.split('.').pop()})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Attachment Preview Modal */}
      <Dialog open={!!previewAttachment} onOpenChange={(v) => !v && setPreviewAttachment(null)}>
        <DialogContent dir="rtl" style={{maxWidth: '750px', maxHeight: '85vh', overflowY: 'auto'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
            <DialogTitle>المرفق: {previewAttachment?.name}</DialogTitle>
            {previewAttachment?.data && (
              <a
                href={previewAttachment.data}
                download={previewAttachment.name}
                className="blue-button"
                style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', fontSize: '12px'}}
              >
                <Download size={14}/> تنزيل الملف
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">معاينة مرفق العملية المعلقة</DialogDescription>
          {previewAttachment && (
            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px'}}>
              {previewAttachment.type?.startsWith('image/') || previewAttachment.data?.startsWith('data:image/') ? (
                <img
                  src={previewAttachment.data}
                  alt={previewAttachment.name}
                  style={{maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                />
              ) : previewAttachment.type === 'application/pdf' || previewAttachment.name?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewAttachment.data}
                  title={previewAttachment.name}
                  style={{width: '100%', height: '65vh', border: 'none', borderRadius: '6px'}}
                />
              ) : (
                <div style={{textAlign: 'center', padding: '30px 10px'}}>
                  <FileText size={48} style={{margin: '0 auto 12px', color: '#64748b'}} />
                  <p style={{fontSize: '14px', color: '#1e293b', marginBottom: '10px'}}>
                    مستند Word أو ملف مرفق: <b>{previewAttachment.name}</b>
                  </p>
                  <a
                    href={previewAttachment.data}
                    download={previewAttachment.name}
                    className="blue-button"
                    style={{display: 'inline-flex', alignItems: 'center', gap: '6px'}}
                  >
                    <Download size={16}/> اضغط لتحميل الملف وفتحه على جهازك
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
