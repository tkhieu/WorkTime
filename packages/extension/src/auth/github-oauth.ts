import { tokenManager } from './token-manager';
import { config } from '../config/env';
import type { GitHubAuth } from '../types';

// PKCE helpers
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export interface LoginResult {
  token: string;  // JWT from backend
  user: {
    user_id: number;
    github_username: string;
    github_avatar_url: string | null;
    email: string | null;
  };
}

export class GitHubOAuth {
  async login(): Promise<LoginResult> {
    try {
      console.log('Starting GitHub OAuth flow');

      // 1. Generate PKCE values
      const codeVerifier = generateRandomString(128);
      const hashed = await sha256(codeVerifier);
      const codeChallenge = base64URLEncode(hashed);

      // 2. Get redirect URL
      const redirectURL = chrome.identity.getRedirectURL();
      console.log('Redirect URL:', redirectURL);

      // 3. Build auth URL - NO client_secret
      const authURL = new URL('https://github.com/login/oauth/authorize');
      authURL.searchParams.set('client_id', config.GITHUB_CLIENT_ID);
      authURL.searchParams.set('redirect_uri', redirectURL);
      authURL.searchParams.set('scope', 'repo read:user');
      authURL.searchParams.set('code_challenge', codeChallenge);
      authURL.searchParams.set('code_challenge_method', 'S256');

      // 4. Launch OAuth
      const responseURL = await chrome.identity.launchWebAuthFlow({
        url: authURL.toString(),
        interactive: true
      });

      if (!responseURL) {
        throw new Error('OAuth cancelled');
      }

      const code = new URL(responseURL).searchParams.get('code');
      if (!code) {
        throw new Error('No authorization code');
      }

      // 5. Exchange via BACKEND (not GitHub directly)
      return await this.exchangeCodeViaBackend(code, codeVerifier, redirectURL);

    } catch (error) {
      console.error('GitHub OAuth login failed:', error);
      throw error;
    }
  }

  private async exchangeCodeViaBackend(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<LoginResult> {
    const response = await fetch(`${config.API_BASE_URL}/auth/github/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier, redirectUri })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Auth failed' }));
      throw new Error(err.error || 'Authentication failed');
    }

    const result: LoginResult = await response.json();

    // Store JWT token for future API calls
    await tokenManager.saveJWT(result.token);

    // Store user info
    await tokenManager.saveUser({
      id: result.user.user_id,
      login: result.user.github_username,
      avatar_url: result.user.github_avatar_url ?? undefined,
      name: undefined
    });

    // Store for backwards compat
    const auth: GitHubAuth = {
      accessToken: result.token,
      tokenType: 'bearer',
      scope: 'repo read:user',
      expiresAt: null,
      user: {
        id: result.user.user_id,
        login: result.user.github_username,
        avatar_url: result.user.github_avatar_url ?? undefined,
        email: result.user.email ?? undefined
      }
    };
    await tokenManager.saveAuth(auth);

    console.log('GitHub authentication successful:', result.user.github_username);
    return result;
  }

  async logout(): Promise<void> {
    await tokenManager.clearAuth();
    console.log('GitHub logout successful');
  }

  async getAuthStatus(): Promise<{ authenticated: boolean; user?: any }> {
    // Check JWT-based authentication (new flow)
    const jwt = await tokenManager.getJWT();
    if (jwt && !tokenManager.isTokenExpired(jwt)) {
      const user = await tokenManager.getUser();
      return { authenticated: true, user };
    }

    // Fallback to legacy auth check
    const auth = await tokenManager.getAuth();
    if (auth?.user) {
      return { authenticated: true, user: auth.user };
    }

    return { authenticated: false };
  }
}

export const githubOAuth = new GitHubOAuth();
