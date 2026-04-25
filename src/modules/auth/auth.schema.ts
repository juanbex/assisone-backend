import { z } from 'zod'

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
})

export const RegisterSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(6),
  tenantId: z.string().uuid().optional(),
  tenantName: z.string().min(2).optional(),
})

export type LoginInput    = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
