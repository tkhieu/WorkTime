import { tokenManager } from './token-manager';
import type { GitHubAuth } from '../types';

// TODO: Replace with your actual Client ID from GitHub OAuth App
// Register at: https://github.com/settings/developers
const GITHUB_CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const GITHUB_CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE'; // Should be in environment variable

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

export class GitHubOAuth {
  async login(): Promise<void> {
    try {
      console.log('Starting GitHub OAuth flow');

      // Generate PKCE values
      const codeVerifier = generateRandomString(128);
      const hashed = await sha256(codeVerifier);
      const codeChallenge = base64URLEncode(hashed);

      // Store code verifier for later use
      await chrome.storage.local.set({ pkce_code_verifier: codeVerifier });

      // Get redirect URL
      const redirectURL = chrome.identity.getRedirectURL();
      console.log('Redirect URL:', redirectURL);

      // Build authorization URL
      const authURL = new URL('https://github.com/login/oauth/authorize');
      authURL.searchParams.set('client_id', GITHUB_CLIENT_ID);
      authURL.searchParams.set('redirect_uri', redirectURL);
      authURL.searchParams.set('scope', 'repo read:user');
      authURL.searchParams.set('response_type', 'code');
      authURL.searchParams.set('code_challenge', codeChallenge);
      authURL.searchParams.set('code_challenge_method', 'S256');

      // Launch OAuth flow
      const responseURL = await chrome.identity.launchWebAuthFlow({
        url: authURL.toString(),
        interactive: true
      });

      console.log('OAuth redirect received:', responseURL);

      if (!responseURL) {
        throw new Error('OAuth flow was cancelled or failed');
      }

      // Extract authorization code
      const url = new URL(responseURL);
      const code = url.searchParams.get('code');

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for token
      await this.exchangeCodeForToken(code, codeVerifier, redirectURL);

    } catch (error) {
      console.error('GitHub OAuth login failed:', error);
      throw error;
    }
  }

  private async exchangeCodeForToken(code: string, codeVerifier: string, redirectURI: string): Promise<void> {
    const tokenURL = 'https://github.com/login/oauth/access_token';

    const response = await fetch(tokenURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectURI,
        code_verifier: codeVerifier
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Token exchange error: ${data.error_description}`);
    }

    // Fetch user info
    const user = await this.fetchUserInfo(data.access_token);

    // Store auth data
    const auth: GitHubAuth = {
      accessToken: data.access_token,
      tokenType: 'bearer',
      scope: data.scope,
      expiresAt: null, // OAuth Apps don't expire
      user: {
        login: user.login,
        id: user.id,
        avatar_url: user.avatar_url,
        name: user.name || user.login
      }
    };

    await tokenManager.saveAuth(auth);
    console.log('GitHub authentication successful:', user.login);
  }

  private async fetchUserInfo(accessToken: string): Promise<any> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    return response.json();
  }

  async logout(): Promise<void> {
    await tokenManager.clearAuth();
    console.log('GitHub logout successful');
  }

  async getAuthStatus(): Promise<{ authenticated: boolean; user?: any }> {
    const auth = await tokenManager.getAuth();
    if (!auth) {
      return { authenticated: false };
    }

    const isValid = await tokenManager.validateToken();
    if (!isValid) {
      await tokenManager.clearAuth();
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: auth.user
    };
  }
}

export const githubOAuth = new GitHubOAuth();
