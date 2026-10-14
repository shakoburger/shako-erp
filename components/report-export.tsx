'use client';

import { useState } from 'react';
import { FileText, FileSpreadsheet, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportReport, reportFromPaper, type ReportData } from '@/lib/export-reports';
import { useAgencyAccess, useAgencySettings } from './access-context';

export function ReportExports({
  data,
  reports,
  disabled = false,
}: {
  data?: ReportData;
  reports?: ReportData[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const access = useAgencyAccess();
  const settings = useAgencySettings();

  async function save(e: React.MouseEvent<HTMLButtonElement>, format: 'pdf' | 'xlsx' | 'docx') {
    const container = e.currentTarget.closest('.report-view, .cash-report, .operation-report');
    setBusy(true);
    try {
      const allowed = await fetch('/api/agency/export');
      if (!allowed.ok) throw new Error('ليس لديك صلاحية تصدير التقارير');

      const paper = container?.querySelector<HTMLElement>('.report-paper');
      const singleReport = data || (paper ? reportFromPaper(paper) : null);

      const targetReports = reports && reports.length > 0 ? reports : singleReport ? [singleReport] : [];
      if (!targetReports.length) throw new Error('اختر تقريرًا لعرضه أولًا');

      for (let idx = 0; idx < targetReports.length; idx++) {
        const report = targetReports[idx];
        await exportReport(
          {
            ...report,
            logoUrl:
              report.logoUrl ||
              (settings.logoKey ? '/api/agency/logo?v=' + encodeURIComponent(settings.logoKey) : undefined),
            subtitle: [
              report.subtitle || settings.companyName,
              settings.address,
              settings.agencyEmail,
              settings.taxNumber ? 'الرقم الضريبي: ' + settings.taxNumber : '',
            ]
              .filter(Boolean)
              .join(' · '),
            notes: [...(report.notes || []), ...(settings.reportFooter ? [settings.reportFooter] : [])],
          },
          format
        );
        if (idx < targetReports.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }

      if (targetReports.length > 1) {
        toast.success(`تم تنزيل ${targetReports.length} كشوف حسابات مفصولة لكل عملة بنجاح (${format.toUpperCase()})`);
      } else {
        toast.success('تم تنزيل التقرير ' + format.toUpperCase());
      }
    } catch (err: any) {
      console.error('Export report failed:', err);
      if (format === 'pdf') {
        toast.error((err?.message || 'تعذر تصدير ملف PDF') + ' — يمكنك استخدام زر الطباعة مباشرة');
      } else {
        toast.error(err?.message || 'تعذر تصدير التقرير');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="report-export-buttons">
      {(['pdf', 'xlsx', 'docx'] as const).map((f, i) => (
        <button
          key={f}
          disabled={disabled || busy || !access.export}
          title={!access.export ? 'التصدير غير مسموح لهذا المستخدم' : undefined}
          onClick={(e) => save(e, f)}
        >
          {i === 0 ? <FileDown size={16} /> : i === 1 ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
          {' '}{busy ? 'جارٍ التصدير…' : i === 0 ? 'PDF' : i === 1 ? 'Excel' : 'Word'}
        </button>
      ))}
    </span>
  );
}

export async function permittedExport(action: () => void) {
  try {
    const r = await fetch('/api/agency/export');
    if (!r.ok) throw new Error('ليس لديك صلاحية التصدير والطباعة');
    action();
  } catch (e: any) {
    toast.error(e.message);
  }
}
