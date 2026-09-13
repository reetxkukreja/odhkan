import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { CommunitySection } from './components/CommunitySection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { MysterySection } from './components/MysterySection';
import { FinalCtaSection } from './components/FinalCtaSection';
import { Footer } from './components/Footer';
import { JoinModal } from './components/JoinModal';
import { RevealModal } from './components/RevealModal';
import { WithdrawModal } from './components/WithdrawModal';
import { AdminLoginPage } from './components/AdminLoginPage';
import { AdminDashboard } from './components/AdminDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicStatus, CountdownTime } from './types';
import { calculateCountdown } from './utils/countdown';

export default function App() {
  // Current client-side route ('home' | 'admin' | 'admin-login')
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return localStorage.getItem('odhkan_admin_token');
  });

  // Public status
  const [totalCount, setTotalCount] = useState<number>(40);
  const [eventStatus, setEventStatus] = useState<'open' | 'locked' | 'revealed'>('open');
  const [revealTime, setRevealTime] = useState<string>(new Date().toISOString());
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [eventId, setEventId] = useState<string>('');
  const [eventName, setEventName] = useState<string>('');
  const [eventDate, setEventDate] = useState<string>('');
  const [eventDay, setEventDay] = useState<string>('');
  const [eventTimeFormatted, setEventTimeFormatted] = useState<string>('');
  const [eventDisplayTitle, setEventDisplayTitle] = useState<string>('');

  const [countdown, setCountdown] = useState<CountdownTime>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalSeconds: 0,
    isZero: false,
  });

  // Public Modals
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isRevealOpen, setIsRevealOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawPrefillRoll, setWithdrawPrefillRoll] = useState('');

  const handleOpenWithdraw = (roll?: string) => {
    setWithdrawPrefillRoll(roll || localStorage.getItem('odhkan_user_roll') || '');
    setIsWithdrawOpen(true);
  };

  // Navigation handler
  const navigateTo = (path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  // Sync browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check auth redirect for /admin
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/admin') {
      const token = localStorage.getItem('odhkan_admin_token');
      if (!token) {
        window.history.replaceState(null, '', '/admin/login');
        setCurrentPath('/admin/login');
      }
    } else if (path === '/admin/login') {
      const token = localStorage.getItem('odhkan_admin_token');
      if (token) {
        window.history.replaceState(null, '', '/admin');
        setCurrentPath('/admin');
      }
    }
  }, [currentPath, adminToken]);

  const applyStatusData = (data: PublicStatus) => {
    if (typeof data.totalCount === 'number') setTotalCount(data.totalCount);
    if (data.eventStatus) setEventStatus(data.eventStatus);
    if (data.revealTime) setRevealTime(data.revealTime);
    if (typeof data.isRevealed === 'boolean') setIsRevealed(data.isRevealed);
    if (data.eventId) setEventId(data.eventId);
    if (data.eventName) setEventName(data.eventName);
    if (data.eventDate) setEventDate(data.eventDate);
    if (data.eventDay) setEventDay(data.eventDay);
    if (data.eventTimeFormatted) setEventTimeFormatted(data.eventTimeFormatted);
    if (data.eventDisplayTitle) setEventDisplayTitle(data.eventDisplayTitle);
  };

  // Fetch public status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/public/status');
      if (res.ok) {
        const data: PublicStatus = await res.json();
        applyStatusData(data);
      }
    } catch (err) {
      console.error('Error fetching Odhkan status:', err);
    }
  }, []);

  // Real-time synchronization
  useEffect(() => {
    fetchStatus();

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/public/stream');
      eventSource.onmessage = (event) => {
        try {
          const data: PublicStatus = JSON.parse(event.data);
          applyStatusData(data);
        } catch {
          // ignore
        }
      };
      eventSource.onerror = () => {
        eventSource?.close();
      };
    } catch {
      // fallback
    }

    const interval = setInterval(fetchStatus, 8000);
    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, [fetchStatus]);

  // Countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      const c = calculateCountdown(revealTime);
      setCountdown(c);
      if (c.isZero && !isRevealed) {
        setIsRevealed(true);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [revealTime, isRevealed]);

  // Handle Admin Login Success
  const handleAdminLoginSuccess = (token: string) => {
    setAdminToken(token);
    navigateTo('/admin');
  };

  // Handle Admin Logout
  const handleAdminLogout = async () => {
    if (adminToken) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch {
        // ignore
      }
    }
    localStorage.removeItem('odhkan_admin_token');
    localStorage.removeItem('odhkan_admin_user');
    setAdminToken(null);
    navigateTo('/admin/login');
  };

  // -------------------------------------------------------------
  // ROUTING RENDER
  // -------------------------------------------------------------

  // 1. /admin/login route
  if (currentPath === '/admin/login') {
    return (
      <ErrorBoundary fallbackTitle="Odhkan Admin Error">
        <AdminLoginPage
          onLoginSuccess={handleAdminLoginSuccess}
          onNavigateHome={() => navigateTo('/')}
        />
      </ErrorBoundary>
    );
  }

  // 2. /admin route
  if (currentPath === '/admin') {
    // If not authenticated, render login page
    if (!adminToken) {
      return (
        <ErrorBoundary fallbackTitle="Odhkan Admin Error">
          <AdminLoginPage
            onLoginSuccess={handleAdminLoginSuccess}
            onNavigateHome={() => navigateTo('/')}
          />
        </ErrorBoundary>
      );
    }

    return (
      <ErrorBoundary fallbackTitle="Odhkan Admin Error">
        <AdminDashboard
          token={adminToken}
          onLogout={handleAdminLogout}
          onNavigateHome={() => navigateTo('/')}
        />
      </ErrorBoundary>
    );
  }

  // 3. Public Website (Default: '/')
  return (
    <ErrorBoundary fallbackTitle="Odhkan Application Error">
      <div className="min-h-screen flex flex-col bg-[#E11D1E] text-white font-sans selection:bg-black selection:text-white antialiased">
        {/* 1. TOP NAVIGATION */}
        <Navbar
          onOpenJoin={() => setIsJoinOpen(true)}
          onOpenReveal={() => setIsRevealOpen(true)}
          onOpenWithdraw={() => handleOpenWithdraw()}
          isRevealed={isRevealed}
          totalCount={totalCount}
        />

        <main className="flex-1">
          {/* 2. HERO SECTION */}
          <HeroSection
            totalCount={totalCount}
            countdown={countdown}
            isRevealed={isRevealed}
            onJoinClick={() => setIsJoinOpen(true)}
            onRevealClick={() => setIsRevealOpen(true)}
            eventDate={eventDate}
            eventDay={eventDay}
            eventTimeFormatted={eventTimeFormatted}
            eventDisplayTitle={eventDisplayTitle}
          />

          {/* 3. COMMUNITY SECTION (Live Count with STRICT NO BATCH BREAKDOWN) */}
          <CommunitySection totalCount={totalCount} />

          {/* 4. HOW IT WORKS */}
          <HowItWorksSection />

          {/* 5. MYSTERY & COUNTDOWN SECTION */}
          <MysterySection
            countdown={countdown}
            isRevealed={isRevealed}
            onRevealClick={() => setIsRevealOpen(true)}
            eventDate={eventDate}
            eventDay={eventDay}
            eventTimeFormatted={eventTimeFormatted}
            eventDisplayTitle={eventDisplayTitle}
          />

          {/* 6. FINAL CTA */}
          <FinalCtaSection
            onJoinClick={() => setIsJoinOpen(true)}
            onRevealClick={() => setIsRevealOpen(true)}
            isRevealed={isRevealed}
          />
        </main>

        {/* 7. FOOTER with subtle Manage link & Can't make it link */}
        <Footer
          onOpenAdmin={() => navigateTo(adminToken ? '/admin' : '/admin/login')}
          onOpenWithdraw={() => handleOpenWithdraw()}
        />

        {/* PUBLIC MODALS */}
        <JoinModal
          isOpen={isJoinOpen}
          onClose={() => setIsJoinOpen(false)}
          countdown={countdown}
          totalCount={totalCount}
          onParticipantJoined={fetchStatus}
          onOpenWithdraw={handleOpenWithdraw}
          eventId={eventId}
        />

        <RevealModal
          isOpen={isRevealOpen}
          onClose={() => setIsRevealOpen(false)}
          isRevealed={isRevealed}
          onOpenWithdraw={handleOpenWithdraw}
          eventId={eventId}
        />

        <WithdrawModal
          isOpen={isWithdrawOpen}
          onClose={() => setIsWithdrawOpen(false)}
          prefilledRoll={withdrawPrefillRoll}
          eventId={eventId}
          onWithdrawnSuccess={(newTotal) => {
            if (typeof newTotal === 'number') {
              setTotalCount(newTotal);
            } else {
              fetchStatus();
            }
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
