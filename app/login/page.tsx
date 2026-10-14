import { LoginPage } from '@/components/login-page';

export const metadata = {
  title: 'تسجيل الدخول | SHAKO ERP',
  description: 'تسجيل الدخول إلى نظام SHAKO لإدارة الحسابات والتذاكر ووكالات السفر',
};

export default function Page() {
  return <LoginPage returnTo="/" />;
}
