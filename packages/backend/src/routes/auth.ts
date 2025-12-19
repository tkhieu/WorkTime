import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Env, GitHubUser, JWTPayload } from '../types';
import { signJWT } from '../utils/jwt';
import { errors } from '../utils/errors';
import { upsertUser } from '../db/queries';

const auth = new Hono<{ Bindings: Env }>();

// Validation schemas
const callbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  codeVerifier: z.string().min(43, 'Invalid code verifier').optional(),
  redirectUri: z.string().url().optional()
});


/**
 * GitHub OAuth callback handler with PKCE support
 * POST /auth/github/callback
 * Body: { code: string, codeVerifier: string, redirectUri: string }
 */
auth.post('/github/callback', zValidator('json', callbackSchema), async (c) => {
  const { code, codeVerifier, redirectUri } = c.req.valid('json');

  try {
    // Exchange code for GitHub access token (with PKCE)
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      })
    });

    const tokenData = await tokenResponse.json<{
      access_token?: string;
      error?: string;
      error_description?: string;
    }>();

    if (tokenData.error || !tokenData.access_token) {
      throw errors.badRequest(
        'Failed to exchange authorization code',
        { error: tokenData.error_description || tokenData.error }
      );
    }

    const githubToken = tokenData.access_token;

    // Fetch user info from GitHub API
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'WorkTime-Extension'
      }
    });

    if (!userResponse.ok) {
      throw errors.internal('Failed to fetch user info from GitHub');
    }

    const githubUser = await userResponse.json<GitHubUser>();

    // Upsert user in D1 database
    const user = await upsertUser(c.env.DB, githubUser);

    // Store GitHub token in KV (7-day TTL)
    const kvKey = `github_token:${user.user_id}`;
    await c.env.KV.put(kvKey, githubToken, {
      expirationTtl: 7 * 24 * 60 * 60 // 7 days
    });

    // Generate JWT token (7-day expiry)
    const jwtPayload: JWTPayload = {
      userId: user.user_id,
      githubUserId: user.github_user_id,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
    };

    const token = await signJWT(jwtPayload, c.env.JWT_SECRET);

    return c.json({
      token,
      user: {
        user_id: user.user_id,
        github_username: user.github_username,
        github_avatar_url: user.github_avatar_url,
        email: user.email
      }
    }, 200);

  } catch (error) {
    if (error instanceof Error && error.name === 'APIError') {
      throw error;
    }
    console.error('OAuth callback error:', error);
    throw errors.internal('Failed to complete GitHub authentication');
  }
});

/**
 * JWT token refresh endpoint
 * POST /auth/refresh
 * Headers: Authorization: Bearer <jwt>
 */
auth.post('/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw errors.unauthorized('Missing token');
  }

  const oldJwt = authHeader.slice(7);

  try {
    // Manually verify JWT signature (allow expired tokens for refresh)
    const parts = oldJwt.split('.');
    if (parts.length !== 3) {
      throw errors.unauthorized('Invalid token format');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const encoder = new TextEncoder();

    // Verify signature
    const data = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(c.env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = base64UrlDecode(encodedSignature);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(data)
    );

    if (!isValid) {
      throw errors.unauthorized('Invalid token signature');
    }

    // Decode payload (ignore expiration for refresh)
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload))
    ) as JWTPayload;

    // Check if GitHub token still exists in KV
    const kvKey = `github_token:${payload.userId}`;
    const githubToken = await c.env.KV.get(kvKey);

    if (!githubToken) {
      throw errors.unauthorized('Session expired - please login again');
    }

    // Issue new JWT (7-day expiry)
    const newPayload: JWTPayload = {
      userId: payload.userId,
      githubUserId: payload.githubUserId,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
    };

    const token = await signJWT(newPayload, c.env.JWT_SECRET);
    return c.json({ token });

  } catch (error) {
    if (error instanceof Error && error.name === 'APIError') throw error;
    throw errors.unauthorized('Token refresh failed');
  }
});

/**
 * Base64 URL decode helper
 */
function base64UrlDecode(str: string): Uint8Array {
  const paddedStr = str + '=='.slice(0, (4 - str.length % 4) % 4);
  const base64 = paddedStr.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default auth;
