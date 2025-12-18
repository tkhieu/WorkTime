import { Hono } from 'hono';
import { Env, GitHubUser, JWTPayload } from '../types';
import { signJWT } from '../utils/jwt';
import { errors } from '../utils/errors';
import { upsertUser } from '../db/queries';

const auth = new Hono<{ Bindings: Env }>();

/**
 * GitHub OAuth callback handler
 * POST /auth/github/callback
 * Body: { code: string }
 */
auth.post('/github/callback', async (c) => {
  const { code } = await c.req.json<{ code: string }>();

  if (!code) {
    throw errors.badRequest('Authorization code is required');
  }

  try {
    // Exchange code for GitHub access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code
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

export default auth;
