'use client';
import {useAgencySettings} from './access-context';
export function AgencyLetterhead(){const s=useAgencySettings();return <div className="report-letterhead"><div><h2>{s.companyName}</h2><p>الهاتف: <b dir="ltr">{s.phones}</b></p>{s.address&&<p>{s.address}</p>}{s.agencyEmail&&<p dir="ltr">{s.agencyEmail}</p>}{s.taxNumber&&<p>رقم التسجيل: {s.taxNumber}</p>}</div>{s.logoKey?<img className="report-agency-logo" src={'/api/agency/logo?v='+encodeURIComponent(s.logoKey)} alt="شعار الوكالة"/>:<strong>{s.systemName}<small>TRAVEL & FINANCE</small></strong>}</div>}
export function AgencyReportFooter(){const s=useAgencySettings();return s.reportFooter?<p className="report-footnote agency-report-footer">{s.reportFooter}</p>:null}
