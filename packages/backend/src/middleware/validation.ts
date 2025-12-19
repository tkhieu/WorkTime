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

// Activity validation schemas
export const activityTypeEnum = z.enum(['comment', 'approve', 'request_changes']);

export const activityCreateSchema = z.object({
  activity_type: activityTypeEnum,
  repo_owner: z.string().min(1, 'Repository owner is required'),
  repo_name: z.string().min(1, 'Repository name is required'),
  pr_number: z.number().int().positive('PR number must be a positive integer'),
  session_id: z.number().int().positive().optional(),
  metadata: z.object({
    duration_seconds: z.number().int().nonnegative().optional(),
    is_inline_comment: z.boolean().optional()
  }).optional(),
  created_at: z.string().optional()
});

export const activityBatchSchema = z.object({
  activities: z.array(activityCreateSchema).min(1, 'At least one activity is required').max(100, 'Maximum 100 activities per batch')
});

export const activityListQuerySchema = z.object({
  limit: z.string().optional().default('50').transform(Number),
  offset: z.string().optional().default('0').transform(Number),
  activity_type: activityTypeEnum.optional(),
  repo_owner: z.string().optional(),
  repo_name: z.string().optional(),
  pr_number: z.string().optional().transform(Number)
});

// Validators
export const validateSessionStart = zValidator('json', sessionStartSchema);
export const validateSessionEnd = zValidator('json', sessionEndSchema);
export const validatePagination = zValidator('query', paginationSchema);
export const validateDaysQuery = zValidator('query', daysQuerySchema);
export const validateActivityCreate = zValidator('json', activityCreateSchema);
export const validateActivityBatch = zValidator('json', activityBatchSchema);
export const validateActivityListQuery = zValidator('query', activityListQuerySchema);
