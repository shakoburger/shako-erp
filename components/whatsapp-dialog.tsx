'use client';
import {useState,useEffect} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {ERPIcon} from '@/components/erp-icons';
import {Copy,Check,ExternalLink,MessageSquare,Phone,Send} from 'lucide-react';
import {toast} from 'sonner';
import {cleanWhatsAppPhone,getWhatsAppUrl,openWhatsAppDirect} from '@/lib/whatsapp';

export interface WhatsAppDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 title?: string;
 recipientName: string;
 initialPhone?: string;
 initialMessage: string;
}

export function WhatsAppDialog({
 open,
 onOpenChange,
 title = 'إرسال عبر WhatsApp 📲',
 recipientName,
 initialPhone = '',
 initialMessage
}: WhatsAppDialogProps) {
 const [phone, setPhone] = useState(initialPhone);
 const [message, setMessage] = useState(initialMessage);
 const [copied, setCopied] = useState(false);

 useEffect(() => {
  if (open) {
   setPhone(initialPhone || '');
   setMessage(initialMessage || '');
   setCopied(false);
  }
 }, [open, initialPhone, initialMessage]);

 const cleanedPhone = cleanWhatsAppPhone(phone);

 const handleCopy = async () => {
  try {
   await navigator.clipboard.writeText(message);
   setCopied(true);
   toast.success('تم نسخ نص الرسالة إلى الحافظة بنجاح');
   setTimeout(() => setCopied(false), 2500);
  } catch {
   toast.error('تعذر نسخ النص');
  }
 };

 const handleSend = () => {
  if (!phone.trim()) {
   toast.warning('يرجى كتابة رقم الهاتف لإرسال الرسالة مباشرة، أو يمكنك نسخ الرسالة');
  }
  openWhatsAppDirect(phone, message);
  onOpenChange(false);
  toast.success('جاري فتح تطبيق WhatsApp…');
 };

 return (
  <Dialog open={open} onOpenChange={onOpenChange}>
   <DialogContent
    className="record-dialog whatsapp-dialog"
    dir="rtl"
    style={{
     maxWidth: '540px',
     padding: '24px',
     borderRadius: '12px',
     background: '#ffffff'
    }}
   >
    {/* Dialog Header */}
    <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'}}>
     <div
      style={{
       width: '40px',
       height: '40px',
       borderRadius: '50%',
       background: '#25D366',
       color: 'white',
       display: 'flex',
       alignItems: 'center',
       justifyContent: 'center',
       boxShadow: '0 2px 6px rgba(37,211,102,0.3)'
      }}
     >
      <ERPIcon name="whatsapp" size={24} />
     </div>
     <div>
      <DialogTitle style={{fontSize: '18px', fontWeight: 'bold', color: '#0F766E', margin: 0}}>
       {title}
      </DialogTitle>
      <DialogDescription style={{fontSize: '13px', color: '#64748b', margin: '2px 0 0'}}>
       إرسال فوري إلى: <strong>{recipientName || 'العميل'}</strong>
      </DialogDescription>
     </div>
    </div>

    {/* Phone Number Field */}
    <div style={{marginTop: '12px'}}>
     <label style={{display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#334155'}}>
      رقم هاتف المستلم (WhatsApp) :
     </label>
     <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
      <div
       style={{
        display: 'flex',
        alignItems: 'center',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        padding: '0 10px',
        flex: 1,
        background: '#f8fafc'
       }}
      >
       <Phone size={16} style={{color: '#64748b', marginLeft: '6px'}} />
       <input
        type="tel"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        placeholder="مثال: 01012345678 أو 249912345678"
        dir="ltr"
        style={{
         border: 0,
         outline: 'none',
         background: 'transparent',
         padding: '9px 4px',
         fontSize: '14px',
         width: '100%',
         color: '#0f172a',
         fontWeight: '500'
        }}
       />
      </div>
      {cleanedPhone && (
       <span
        dir="ltr"
        style={{
         fontSize: '11px',
         color: '#059669',
         background: '#ecfdf5',
         padding: '6px 10px',
         borderRadius: '6px',
         border: '1px solid #a7f3d0',
         whiteSpace: 'nowrap'
        }}
       >
        +{cleanedPhone}
       </span>
      )}
     </div>
     <small style={{fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px'}}>
      يقبل الأرقام المحلية والدولية (مصر، السودان، السعودية، الإمارات، إلخ).
     </small>
    </div>

    {/* Live WhatsApp Chat Bubble Preview */}
    <div style={{marginTop: '14px'}}>
     <label style={{display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#334155'}}>
      معاينة نص الرسالة التفاعلية:
     </label>
     <div
      style={{
       background: '#efeae2', // Authentic WhatsApp background color
       backgroundImage: 'radial-gradient(#00000008 1px, transparent 1px)',
       backgroundSize: '16px 16px',
       border: '1px solid #dcd7ce',
       borderRadius: '8px',
       padding: '12px',
       maxHeight: '230px',
       overflowY: 'auto'
      }}
     >
      {/* WhatsApp Message Bubble */}
      <div
       style={{
        background: '#ffffff',
        borderRadius: '8px 0px 8px 8px',
        padding: '10px 12px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        position: 'relative'
       }}
      >
       <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={8}
        style={{
         width: '100%',
         border: 0,
         outline: 'none',
         resize: 'vertical',
         fontSize: '13px',
         lineHeight: 1.6,
         color: '#111b21',
         fontFamily: 'inherit',
         background: 'transparent',
         whiteSpace: 'pre-wrap'
        }}
       />
       <div
        style={{
         display: 'flex',
         justifyContent: 'flex-end',
         alignItems: 'center',
         gap: '4px',
         fontSize: '11px',
         color: '#667781',
         marginTop: '4px'
        }}
       >
        <span>الآن</span>
        <span style={{color: '#53bdeb'}}>✓✓</span>
       </div>
      </div>
     </div>
    </div>

    {/* Action Buttons */}
    <div
     style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      marginTop: '20px',
      paddingTop: '12px',
      borderTop: '1px solid #e2e8f0'
     }}
    >
     <button
      type="button"
      onClick={handleCopy}
      className="plain-button"
      style={{
       display: 'flex',
       alignItems: 'center',
       gap: '6px',
       fontSize: '13px',
       padding: '8px 14px'
      }}
     >
      {copied ? <Check size={16} color="#059669" /> : <Copy size={16} />}
      {copied ? 'تم النسخ!' : 'نسخ النص'}
     </button>

     <div style={{display: 'flex', gap: '8px'}}>
      <button
       type="button"
       className="plain-button"
       onClick={() => onOpenChange(false)}
       style={{fontSize: '13px'}}
      >
       إلغاء
      </button>

      <button
       type="button"
       onClick={handleSend}
       style={{
        background: '#25D366',
        color: '#ffffff',
        border: 0,
        borderRadius: '6px',
        padding: '9px 18px',
        fontSize: '13px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(37,211,102,0.35)'
       }}
      >
       <Send size={15} />
       إرسال عبر WhatsApp 📲
      </button>
     </div>
    </div>
   </DialogContent>
  </Dialog>
 );
}
