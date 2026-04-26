/**
 * Parsea texto libre de tiempo → minutos
 * Acepta: "15", "15 min", "15 minutos", "1 hora", "una hora",
 *         "media hora", "1h30", "1 hora 30 min", "45min", etc.
 * Retorna null si no puede parsear.
 */
export function parseEtaText(text: string): number | null {
  const t = text.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes

  // "media hora"
  if (t.includes('media hora') || t === 'media') return 30

  // "1 hora 30 min" / "1h30" / "1 hora 30"
  const horaMin = t.match(/(\d+)\s*h(?:ora?s?)?\s*(\d+)/)
  if (horaMin) return parseInt(horaMin[1]) * 60 + parseInt(horaMin[2])

  // "1 hora" / "2 horas" / "una hora"
  if (t.includes('una hora')) return 60
  if (t.includes('dos horas')) return 120
  if (t.includes('tres horas')) return 180
  const soloHora = t.match(/(\d+)\s*h(?:ora?s?)?(?:\s|$)/)
  if (soloHora && !t.match(/\d+\s*min/)) return parseInt(soloHora[1]) * 60

  // "45 min" / "45 minutos" / "45min"
  const soloMin = t.match(/(\d+)\s*min/)
  if (soloMin) return parseInt(soloMin[1])

  // número solo: "15", "30", "45"
  const soloNum = t.match(/^(\d+)$/)
  if (soloNum) {
    const n = parseInt(soloNum[1])
    if (n > 0 && n <= 300) return n
  }

  return null
}
