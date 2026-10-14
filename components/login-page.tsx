'use client';

import { useState } from 'react';
import {
  Plane,
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  Loader2,
  Sparkles,
  AlertCircle,
  Crown,
  Briefcase,
  Ticket,
  Calculator,
  ArrowRight,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

interface LoginPageProps {
  onLoginSuccess?: () => void;
  returnTo?: string;
}

export function LoginPage({ onLoginSuccess, returnTo = '/' }: LoginPageProps) {
  // Portal Tab: 'owner' (مالك ومزود المنصة) vs 'agency' (الوكالة المشتركة التي اشترت النظام)
  const [portalMode, setPortalMode] = useState<'owner' | 'agency'>('owner');

  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agencyRoleSelected, setAgencyRoleSelected] = useState<'admin' | 'accountant' | 'booking'>('admin');

  function handleSwitchPortal(mode: 'owner' | 'agency') {
    setPortalMode(mode);
    setError('');
    if (mode === 'owner') {
      setUsername('owner');
      setPassword('admin123');
    } else {
      setUsername('admin');
      setPassword('admin123');
      setAgencyRoleSelected('admin');
    }
  }

  function handleSelectAgencyRole(role: 'admin' | 'accountant' | 'booking') {
    setAgencyRoleSelected(role);
    setError('');
    if (role === 'admin') {
      setUsername('admin');
      setPassword('admin123');
      toast.info('تم تجهيز بيانات مدير الوكالة (الآدمن المشترك الذي اشترى النظام)');
    } else if (role === 'accountant') {
      setUsername('accountant');
      setPassword('123456');
      toast.info('تم تجهيز بيانات المحاسب المالي في الوكالة');
    } else {
      setUsername('booking');
      setPassword('123456');
      toast.info('تم تجهيز بيانات موظف الحجز والتذاكر في الوكالة');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const finalUser = username.trim();
    const finalPass = password;

    if (!finalUser) {
      setError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني');
      return;
    }
    if (!finalPass) {
      setError('يرجى إدخال كلمة المرور');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: finalUser,
          password: finalPass,
          remember,
        }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدخول؛ تأكد من صحة البيانات المحددة');
      }

      toast.success(`مرحباً بك: ${data.user?.name || ''}`);

      const target = data.user?.redirectTo || returnTo || '/';
      if (data.user?.isOwner && target === '/owner') {
        window.location.assign('/owner');
      } else if (onLoginSuccess && target === '/') {
        onLoginSuccess();
      } else {
        window.location.assign(target);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تسجيل الدخول');
      toast.error(err.message || 'خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #090e1f 0%, #101c38 50%, #162a50 100%)',
        color: '#e2e8f0',
        padding: '32px 16px',
        fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background ambient lighting */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          right: '-10%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: portalMode === 'owner'
            ? 'radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(14, 165, 233, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
          transition: 'background 0.4s ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          left: '-10%',
          width: '650px',
          height: '650px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 127, 121, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Main Container Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.65), 0 0 1px 1px rgba(255, 255, 255, 0.08)',
          padding: '36px 32px',
          zIndex: 1,
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              background: portalMode === 'owner'
                ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)'
                : 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
              border: '2px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '18px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: portalMode === 'owner'
                ? '0 10px 25px rgba(217, 119, 6, 0.4)'
                : '0 10px 25px rgba(2, 132, 199, 0.4)',
              marginBottom: '14px',
              transition: 'all 0.3s ease',
            }}
          >
            {portalMode === 'owner' ? (
              <Crown size={34} color="#ffffff" />
            ) : (
              <Plane size={34} color="#ffffff" style={{ transform: 'rotate(-15deg)' }} />
            )}
          </div>

          <h1
            style={{
              margin: '0 0 6px 0',
              fontSize: '26px',
              fontWeight: 800,
              letterSpacing: '0.5px',
              color: '#ffffff',
            }}
          >
            SHAKO ERP SYSTEM
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: '#94a3b8',
              lineHeight: 1.6,
            }}
          >
            المنظومة السحابية المتقدمة لإدارة وكالات السفر والسياحة والحسابات
          </p>
        </div>

        {/* Big Portal Selector Switch Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'rgba(15, 23, 42, 0.7)',
            padding: '4px',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '20px',
            gap: '4px',
          }}
        >
          {/* Tab 1: Platform Owner */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSwitchPortal('owner')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: portalMode === 'owner' ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid transparent',
              background: portalMode === 'owner' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: portalMode === 'owner' ? '#fbbf24' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              transition: 'all 0.2s ease',
            }}
          >
            <Crown size={17} color={portalMode === 'owner' ? '#fbbf24' : '#94a3b8'} />
            <span>بوابة مالك المنصة</span>
          </button>

          {/* Tab 2: Subscribed Agency */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSwitchPortal('agency')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: portalMode === 'agency' ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid transparent',
              background: portalMode === 'agency' ? 'rgba(2, 132, 199, 0.2)' : 'transparent',
              color: portalMode === 'agency' ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              transition: 'all 0.2s ease',
            }}
          >
            <Building2 size={17} color={portalMode === 'agency' ? '#38bdf8' : '#94a3b8'} />
            <span>بوابة الوكالة المشتركة</span>
          </button>
        </div>

        {/* Portal Scope Explanation Box */}
        {portalMode === 'owner' ? (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '20px',
              fontSize: '12.5px',
              color: '#fef3c7',
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>
              <Crown size={16} />
              <span>أنت مالك المنصة ومزوّد الخدمة السحابية (SaaS Provider)</span>
            </div>
            <p style={{ margin: 0, fontSize: '11.5px', color: '#cbd5e1' }}>
              هذه البوابة خاصة بك كمالك للمنظومة لإدارة كافة الوكالات المشتركة التي اشترت منك، إصدار تراخيصها، متابعة سداد الاشتراكات، وإيقاف أو تفعيل الوكالات. (لا علاقة لها بإدخالات التذاكر وحجوزات الوكالات).
            </p>
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(2, 132, 199, 0.08)',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '20px',
              fontSize: '12.5px',
              color: '#e0f2fe',
              lineHeight: 1.6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
              <Building2 size={16} />
              <span>خاص بالوكالة التي اشترت واشتركت في المنظومة (Agency Client)</span>
            </div>
            <p style={{ margin: '0 0 10px 0', fontSize: '11.5px', color: '#cbd5e1' }}>
              هنا يدخل فريق عمل الوكالة المشتركة (مدير الوكالة الذي اشترى النظام "الآدمن"، المحاسب المالي، وموظف الحجز) للعمل على تذاكر وحسابات وكالتهم.
            </p>

            {/* Role selector inside agency */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleSelectAgencyRole('admin')}
                style={{
                  background: agencyRoleSelected === 'admin' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${agencyRoleSelected === 'admin' ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  padding: '7px 4px',
                  color: agencyRoleSelected === 'admin' ? '#ffffff' : '#94a3b8',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Briefcase size={15} color="#38bdf8" />
                <span>مدير الوكالة (الآدمن)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAgencyRole('accountant')}
                style={{
                  background: agencyRoleSelected === 'accountant' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${agencyRoleSelected === 'accountant' ? '#a855f7' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  padding: '7px 4px',
                  color: agencyRoleSelected === 'accountant' ? '#ffffff' : '#94a3b8',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Calculator size={15} color="#a855f7" />
                <span>المحاسب المالي</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAgencyRole('booking')}
                style={{
                  background: agencyRoleSelected === 'booking' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${agencyRoleSelected === 'booking' ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  padding: '7px 4px',
                  color: agencyRoleSelected === 'booking' ? '#ffffff' : '#94a3b8',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Ticket size={15} color="#10b981" />
                <span>موظف الحجز</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '13px',
              color: '#fca5a5',
              marginBottom: '18px',
            }}
          >
            <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          {/* Username Field */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '8px',
              }}
            >
              {portalMode === 'owner' ? 'اسم مستخدم مالك المنصة' : 'اسم المستخدم أو البريد الإلكتروني للوكالة'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={portalMode === 'owner' ? 'owner' : 'admin, accountant, أو booking'}
                style={{
                  width: '100%',
                  height: '46px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  padding: '0 42px 0 14px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = portalMode === 'owner' ? '#f59e0b' : '#0284c7';
                  e.currentTarget.style.boxShadow = portalMode === 'owner'
                    ? '0 0 0 3px rgba(245, 158, 11, 0.25)'
                    : '0 0 0 3px rgba(2, 132, 199, 0.25)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <User
                size={18}
                color="#64748b"
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '14px',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '8px',
              }}
            >
              كلمة المرور
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                style={{
                  width: '100%',
                  height: '46px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  padding: '0 42px 0 42px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = portalMode === 'owner' ? '#f59e0b' : '#0284c7';
                  e.currentTarget.style.boxShadow = portalMode === 'owner'
                    ? '0 0 0 3px rgba(245, 158, 11, 0.25)'
                    : '0 0 0 3px rgba(2, 132, 199, 0.25)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <Lock
                size={18}
                color="#64748b"
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '14px',
                  pointerEvents: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '12px',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '22px',
              fontSize: '13px',
              color: '#94a3b8',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              id="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: portalMode === 'owner' ? '#f59e0b' : '#0284c7',
                cursor: 'pointer',
              }}
            />
            <label htmlFor="remember" style={{ cursor: 'pointer' }}>
              تذكر جلسة العمل على هذا المتصفح
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: '48px',
              background: portalMode === 'owner'
                ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: portalMode === 'owner'
                ? '0 6px 18px rgba(217, 119, 6, 0.4)'
                : '0 6px 18px rgba(2, 132, 199, 0.4)',
              transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
              opacity: loading ? 0.75 : 1,
            }}
            onMouseOver={(e) => {
              if (!loading) e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="spin" />
                <span>جارٍ التحقق وتوجيهك إلى وجهتك المصرح بها…</span>
              </>
            ) : (
              <>
                {portalMode === 'owner' ? <Crown size={19} /> : <KeyRound size={18} />}
                <span>
                  {portalMode === 'owner'
                    ? 'تسجيل الدخول إلى منصة مالك المنظومة ➔ (/owner)'
                    : 'تسجيل الدخول إلى مساحة عمل الوكالة ➔ (/)'}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Client Portal Link */}
        <div style={{ marginTop: '22px', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
          <a
            href="/portal"
            style={{
              color: '#38bdf8',
              fontSize: '12.5px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Building2 size={15} />
            <span>بوابة الشركات والعملاء للخدمة الذاتية (B2B Client Portal)</span>
          </a>
        </div>
      </div>

      {/* Footer System Info */}
      <div
        style={{
          marginTop: '22px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#64748b',
          zIndex: 1,
        }}
      >
        <p style={{ margin: 0 }}>
          نظام SHAKO SaaS الموحد · منصة مالك النظام منفصلة كلياً عن مساحات عمل الوكالات المشتركة
        </p>
      </div>
    </div>
  );
}
