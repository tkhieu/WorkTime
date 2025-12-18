/**
 * Format milliseconds to human-readable time string
 * @param ms Duration in milliseconds
 * @returns Formatted string (e.g., "2h 15m 30s")
 */
export declare function formatDuration(ms: number): string;
/**
 * Parse GitHub PR URL to extract repository and PR number
 * @param url GitHub PR URL
 * @returns Object with owner, repo, and prNumber, or null if invalid
 */
export declare function parseGitHubPRUrl(url: string): {
    owner: string;
    repo: string;
    prNumber: number;
} | null;
/**
 * Generate unique ID
 * @returns UUID-like string
 */
export declare function generateId(): string;
/**
 * Validate email format
 * @param email Email string to validate
 * @returns true if valid email format
 */
export declare function isValidEmail(email: string): boolean;
/**
 * Sleep utility for async operations
 * @param ms Milliseconds to sleep
 */
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=index.d.ts.map