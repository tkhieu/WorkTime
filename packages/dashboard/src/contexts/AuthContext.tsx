import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AuthContextValue, AuthState, User } from '@/types/auth';
import { buildOAuthURL, isTokenExpired } from '@/lib/auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'worktime_token';
const USER_KEY = 'worktime_user';
const VERIFIER_KEY = 'oauth_code_verifier';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check for existing session on mount
  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const userStr = sessionStorage.getItem(USER_KEY);

    if (token && userStr && !isTokenExpired(token)) {
      try {
        const user = JSON.parse(userStr) as User;
        setState({
          user,
          token,
          isLoading: false,
          isAuthenticated: true,
        });
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      // Clear invalid/expired session
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async () => {
    try {
      const { url, codeVerifier } = await buildOAuthURL();
      sessionStorage.setItem(VERIFIER_KEY, codeVerifier);
      window.location.href = url;
    } catch (error) {
      console.error('Failed to initiate login:', error);
      throw error;
    }
  };

  const handleOAuthCallback = async (code: string, codeVerifier: string) => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

      const response = await fetch(`${apiBaseUrl}/auth/github/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        throw new Error('OAuth callback failed');
      }

      const data = await response.json();

      if (!data.token || !data.user) {
        throw new Error('Invalid response from server');
      }

      // Store token and user
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
      sessionStorage.removeItem(VERIFIER_KEY);

      setState({
        user: data.user,
        token: data.token,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);

    setState({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    handleOAuthCallback,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
