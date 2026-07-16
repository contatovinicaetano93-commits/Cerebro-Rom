import { z } from 'zod'

// Auth Schemas
export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const LogoutRequestSchema = z.object({})
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>

// Overview Schemas
export const OverviewQuerySchema = z.object({
  unit: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
})
export type OverviewQuery = z.infer<typeof OverviewQuerySchema>

// Health Schemas
export const HealthQuerySchema = z.object({
  verbose: z.string().optional().transform((v) => v === 'true'),
})
export type HealthQuery = z.infer<typeof HealthQuerySchema>

// Generic Response
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  })

export function parseRequestBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body)
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: Record<string, any>): z.infer<T> {
  return schema.parse(query)
}

export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { valid: true; data: z.infer<T> } | { valid: false; error: string } {
  try {
    return { valid: true, data: schema.parse(data) }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { valid: false, error: e.errors[0]?.message || 'Validation error' }
    }
    return { valid: false, error: 'Unknown validation error' }
  }
}
