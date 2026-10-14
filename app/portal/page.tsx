import { ClientPortal } from '@/components/portal/client-portal';

export const metadata = {
  title: 'بوابة العملاء والشركات | B2B Client Portal',
  description: 'بوابة الخدمة الذاتية لعملاء وشركاء وكالة السفر والسياحة',
};

export default function PortalPage() {
  return <ClientPortal />;
}
