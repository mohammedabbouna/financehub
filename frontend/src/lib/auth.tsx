'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch /auth/me after a profile edit so the sidebar shows the new name. */
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  pending2FA: { challenge: string; email: string } | null;
  verify2FA: (code: string) => Promise<void>;
  cancel2FA: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  isAuthenticated: false,
  pending2FA: null,
  verify2FA: async () => {},
  cancel2FA: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending2FA, setPending2FA] = useState<{ challenge: string; email: string } | null>(null);

  const loadUser = useCallback(async () => {
    try {
      if (api.isAuthenticated()) {
        const data = await api.getMe();
        setUser(data.user as User);
      }
    } catch {
      api.clearAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    if (data.requires_2fa) {
      setPending2FA({ challenge: data.challenge, email });
      return;
    }
    api.setTokens(data.tokens.access_token, data.tokens.refresh_token);
    setUser(data.user as User);
  };

  const verify2FA = async (code: string) => {
    if (!pending2FA) throw new Error('No pending 2FA');
    const data = await api.verify2fa(pending2FA.challenge, code);
    api.setTokens(data.tokens.access_token, data.tokens.refresh_token);
    setUser(data.user as User);
    setPending2FA(null);
  };

  const cancel2FA = () => setPending2FA(null);

  const register = async (name: string, email: string, password: string) => {
    const data = await api.register(name, email, password);
    api.setTokens(data.tokens.access_token, data.tokens.refresh_token);
    setUser(data.user as User);
  };

  const logout = () => {
    // Best-effort server-side revocation of the refresh token.
    const refreshToken =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('financehub_refresh_token')
        : null;
    if (refreshToken) {
      void api.logout(refreshToken).catch(() => undefined);
    }
    api.clearAuth();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser: loadUser,
        isAuthenticated: !!user,
        pending2FA,
        verify2FA,
        cancel2FA,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
