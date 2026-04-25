import { db } from '../../shared/lib/db'

const SEED_DATA = [
  {
    name: 'auto', icon: '🚗',
    types: [
      { name: 'Grúa liviana',       slaMinutes: 45 },
      { name: 'Grúa pesada',        slaMinutes: 60 },
      { name: 'Carro taller',       slaMinutes: 60 },
      { name: 'Conductor elegido',  slaMinutes: 30 },
      { name: 'Cambio de llanta',   slaMinutes: 30 },
      { name: 'Batería (paso corriente)', slaMinutes: 30 },
    ],
  },
  {
    name: 'hogar', icon: '🏠',
    types: [
      { name: 'Plomería',       slaMinutes: 60 },
      { name: 'Gas domiciliario', slaMinutes: 45 },
      { name: 'Electricidad',   slaMinutes: 60 },
      { name: 'Cerrajería',     slaMinutes: 45 },
      { name: 'Vidriería',      slaMinutes: 90 },
    ],
  },
  {
    name: 'medico', icon: '🏥',
    types: [
      { name: 'Consulta médica',          slaMinutes: 120 },
      { name: 'Programación de cita',     slaMinutes: 30  },
      { name: 'Reprogramación de cita',   slaMinutes: 30  },
      { name: 'Cancelación de cita',      slaMinutes: 15  },
      { name: 'Orientación médica',       slaMinutes: 20  },
    ],
  },
]

export async function runSeed() {
  const results: string[] = []

  for (const cat of SEED_DATA) {
    let category = await db.serviceCategory.findFirst({ where: { name: cat.name } })
    if (!category) {
      category = await db.serviceCategory.create({ data: { name: cat.name, icon: cat.icon } })
      results.push(`Categoría creada: ${cat.name}`)
    } else {
      results.push(`Categoría ya existe: ${cat.name}`)
    }

    for (const t of cat.types) {
      const existing = await db.serviceType.findFirst({ where: { name: t.name, tenantId: null } })
      if (!existing) {
        await db.serviceType.create({ data: { name: t.name, slaMinutes: t.slaMinutes, categoryId: category.id } })
        results.push(`  + Tipo creado: ${t.name}`)
      }
    }
  }

  return results
}
