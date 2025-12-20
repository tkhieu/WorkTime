/**
 * Generate a random code verifier for PKCE flow
 * @returns Random 128-character string (base64url)
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(96);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

/**
 * Generate code challenge from verifier using SHA256
 * @param verifier The code verifier
 * @returns Base64url encoded SHA256 hash
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(digest));
}

/**
 * Build OAuth URL with PKCE parameters
 * @returns Object with OAuth URL and code verifier
 */
export async function buildOAuthURL(): Promise<{ url: string; codeVerifier: string }> {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error('GitHub client ID not configured');
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: 'read:user user:email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return { url, codeVerifier };
}

/**
 * Decode JWT payload without verification
 * @param token JWT token
 * @returns Decoded payload
 */
export function decodeJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Check if token is expired with 5-minute buffer
 * @param token JWT token
 * @returns True if token is expired or will expire in 5 minutes
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);
  const bufferSeconds = 5 * 60; // 5 minutes

  return payload.exp < (now + bufferSeconds);
}

/**
 * Base64URL encode a byte array
 */
function base64URLEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
