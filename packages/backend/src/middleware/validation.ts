import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Session start validation schema
export const sessionStartSchema = z.object({
  repo_owner: z.string().min(1, 'Repository owner is required'),
  repo_name: z.string().min(1, 'Repository name is required'),
  pr_number: z.number().int().positive('PR number must be a positive integer')
});

// Session end validation schema
export const sessionEndSchema = z.object({
  duration_seconds: z.number().int().nonnegative('Duration must be non-negative').optional()
});

// Query parameter validation schemas
export const paginationSchema = z.object({
  limit: z.string().optional().default('50').transform(Number),
  offset: z.string().optional().default('0').transform(Number)
});

export const daysQuerySchema = z.object({
  days: z.string().optional().default('30').transform(Number)
});

// Validators
export const validateSessionStart = zValidator('json', sessionStartSchema);
export const validateSessionEnd = zValidator('json', sessionEndSchema);
export const validatePagination = zValidator('query', paginationSchema);
export const validateDaysQuery = zValidator('query', daysQuerySchema);
