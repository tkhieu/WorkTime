/**
 * Environment configuration for WorkTime Chrome Extension
 *
 * These values are injected at build time via webpack.DefinePlugin
 * Default values are provided for development
 */

export const config = {
  /**
   * GitHub OAuth Client ID
   * Injected from GITHUB_CLIENT_ID environment variable
   */
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '__DEV_CLIENT_ID__',

  /**
   * Backend API Base URL
   * Injected from API_BASE_URL environment variable
   * Defaults to local Cloudflare Workers dev server
   */
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8787',
} as const;

export type Config = typeof config;
