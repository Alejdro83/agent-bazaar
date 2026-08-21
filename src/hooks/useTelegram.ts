'use client';

import { useEffect, useState, useCallback } from 'react';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  viewportHeight: number;
  viewportStableHeight: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    text: string;
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

interface UseTelegramReturn {
  webApp: TelegramWebApp | null;
  user: TelegramUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  colorScheme: 'light' | 'dark';
  viewportHeight: number;
  haptic: TelegramWebApp['HapticFeedback'] | null;
  mainButton: TelegramWebApp['MainButton'] | null;
  backButton: TelegramWebApp['BackButton'] | null;
  startParam: string | null;
  close: () => void;
  expand: () => void;
}

export function useTelegram(): UseTelegramReturn {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setIsLoading(false);
      return;
    }

    setWebApp(tg);
    tg.ready();
    tg.expand();

    // Validate initData with our server
    const validate = async () => {
      try {
        if (tg.initData) {
          const res = await fetch('/api/auth/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData }),
          });

          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setIsAuthenticated(true);
          } else {
            // Fallback to unsafe data for display (not authenticated)
            console.warn('InitData validation failed, using unsafe data');
            setUser(tg.initDataUnsafe.user || null);
          }
        } else {
          // Running outside Telegram (dev mode)
          setUser(tg.initDataUnsafe.user || null);
        }
      } catch (error) {
        console.error('Auth validation error:', error);
        setUser(tg.initDataUnsafe.user || null);
      } finally {
        setIsLoading(false);
      }
    };

    validate();
  }, []);

  const close = useCallback(() => webApp?.close(), [webApp]);
  const expand = useCallback(() => webApp?.expand(), [webApp]);

  return {
    webApp,
    user,
    isAuthenticated,
    isLoading,
    colorScheme: webApp?.colorScheme || 'dark',
    viewportHeight: webApp?.viewportHeight || 0,
    haptic: webApp?.HapticFeedback || null,
    mainButton: webApp?.MainButton || null,
    backButton: webApp?.BackButton || null,
    startParam: webApp?.initDataUnsafe?.start_param || null,
    close,
    expand,
  };
}
