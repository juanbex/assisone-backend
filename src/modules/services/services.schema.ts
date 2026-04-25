import { z } from 'zod'

export const ServiceStatus = z.enum([
  'received','in_coordination','uncoordinated',
  'coordinated','assigned','in_progress','completed','cancelled',
])

export const CreateServiceSchema = z.object({
  tenantId:      z.string().uuid(),
  clientId:      z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  location:      z.object({ lat: z.number(), lng: z.number(), address: z.string() }),
  notes:         z.string().optional(),
})

export type CreateService     = z.infer<typeof CreateServiceSchema>
export type ServiceStatusType = z.infer<typeof ServiceStatus>
