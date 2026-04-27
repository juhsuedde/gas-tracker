// ============================================================
// Algoritmo de Estimativa Sazonal
// Aprende o padrão de consumo por dia do ano (curva gaussiana)
// ============================================================

// Dados históricos brutos (compras sem distinção instalação/término)
// Usados como base inicial até acumular ciclos reais
export const HISTORICAL_PURCHASES = [
  '2023-04-13', '2023-05-09', '2023-06-16', '2023-08-02',
  '2023-08-21', '2023-08-31', '2023-11-22', '2023-12-13',
  '2024-02-07', '2024-03-20', '2024-08-27', '2024-10-14',
  '2024-10-16', '2024-12-11', '2025-06-18', '2025-07-16',
  '2025-08-22', '2025-09-17', '2025-10-06', '2025-10-30',
  '2025-11-12', '2025-12-19', '2026-04-01'
]

/**
 * Retorna o dia do ano (1–365) de uma data
 */
export function dayOfYear(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d - start
  return Math.floor(diff / 86400000)
}

/**
 * Distância circular entre dois dias do ano (considera wrap jan/dez)
 * Máximo: 182 dias (metade do ano)
 */
function circularDistance(a, b) {
  const diff = Math.abs(a - b)
  return Math.min(diff, 365 - diff)
}

/**
 * Peso gaussiano: quanto um ciclo histórico influencia a estimativa
 * σ = 45 dias — janela suave, captura inverno/verão sem ruído
 */
function gaussianWeight(distance, sigma = 45) {
  return Math.exp(-(distance * distance) / (2 * sigma * sigma))
}

/**
 * Calcula intervalos entre datas de compra históricas
 * Ignora outliers > 120 dias (período com reserva em uso)
 */
function calcHistoricalIntervals() {
  const dates = HISTORICAL_PURCHASES.map(d => new Date(d + 'T12:00:00'))
  const intervals = []
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round((dates[i] - dates[i - 1]) / 86400000)
    if (days <= 120) { // filtra outliers
      intervals.push({
        days,
        installDay: dayOfYear(HISTORICAL_PURCHASES[i - 1])
      })
    }
  }
  return intervals
}

/**
 * Estima quantos dias um botijão vai durar,
 * baseado nos ciclos reais + dados históricos
 *
 * @param {string} local - 'chuveiro' | 'cozinha'
 * @param {string} dataInstalacao - data de instalação (YYYY-MM-DD)
 * @param {Array} cyclesHistory - ciclos concluídos do banco
 * @returns {{ dias: number, confianca: 'alta'|'media'|'baixa', amostras: number }}
 */
export function estimarDuracao(local, dataInstalacao, cyclesHistory = []) {
  const targetDay = dayOfYear(dataInstalacao)

  // Ciclos reais concluídos para este local
  const realCycles = cyclesHistory
    .filter(c => c.local === local && c.data_termino && c.duracao_dias)
    .map(c => ({
      days: c.duracao_dias,
      installDay: dayOfYear(c.data_instalacao),
      isReal: true,
      weight: 2.0 // ciclos reais têm peso duplo
    }))

  // Dados históricos como fallback (peso menor)
  const historicalIntervals = calcHistoricalIntervals().map(i => ({
    ...i,
    isReal: false,
    weight: 1.0
  }))

  // Combina: reais primeiro, histórico completa
  const allSamples = [...realCycles, ...historicalIntervals]

  if (allSamples.length === 0) {
    return { dias: 45, confianca: 'baixa', amostras: 0 }
  }

  // Média ponderada gaussiana
  let weightedSum = 0
  let totalWeight = 0

  for (const sample of allSamples) {
    const dist = circularDistance(targetDay, sample.installDay)
    const gw = gaussianWeight(dist) * sample.weight
    weightedSum += sample.days * gw
    totalWeight += gw
  }

  const estimatedDays = Math.round(weightedSum / totalWeight)

  // Nível de confiança baseado em ciclos reais disponíveis
  const realCount = realCycles.length
  const confianca = realCount >= 4 ? 'alta' : realCount >= 2 ? 'media' : 'baixa'

  return {
    dias: Math.max(estimatedDays, 7), // mínimo 7 dias
    confianca,
    amostras: realCount
  }
}

/**
 * Calcula a data estimada de término e dias restantes
 */
export function calcularPrevisao(local, dataInstalacao, cyclesHistory) {
  const { dias, confianca, amostras } = estimarDuracao(local, dataInstalacao, cyclesHistory)

  const instalacao = new Date(dataInstalacao + 'T12:00:00')
  const termino = new Date(instalacao)
  termino.setDate(termino.getDate() + dias)

  const hoje = new Date()
  hoje.setHours(12, 0, 0, 0)

  const diasRestantes = Math.round((termino - hoje) / 86400000)
  const diasPassados = Math.round((hoje - instalacao) / 86400000)
  const progresso = Math.min(Math.max(diasPassados / dias, 0), 1)

  return {
    dataTermino: termino,
    diasRestantes,
    diasPassados,
    duracaoEstimada: dias,
    progresso,
    confianca,
    amostras
  }
}

/**
 * Gera dados para o gráfico de sazonalidade
 * Retorna duração média agrupada por mês
 */
export function calcularSazonalidade(cyclesHistory) {
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i,
    label: new Date(2024, i, 1).toLocaleString('pt-BR', { month: 'short' }),
    duracoes: [],
    media: null
  }))

  // Ciclos reais
  for (const c of cyclesHistory) {
    if (!c.duracao_dias) continue
    const mes = new Date(c.data_instalacao + 'T12:00:00').getMonth()
    meses[mes].duracoes.push(c.duracao_dias)
  }

  // Histórico para meses sem dados reais
  const hist = calcHistoricalIntervals()
  for (const h of hist) {
    // converte dia do ano em mês aproximado
    const mes = Math.floor((h.installDay / 365) * 12)
    if (meses[mes].duracoes.length === 0) {
      meses[mes].duracoes.push(h.days)
    }
  }

  for (const m of meses) {
    if (m.duracoes.length > 0) {
      m.media = Math.round(m.duracoes.reduce((a, b) => a + b, 0) / m.duracoes.length)
    }
  }

  return meses
}

/**
 * Insight automático de diferença sazonal
 */
export function calcularInsightSazonal(cyclesHistory) {
  const sazon = calcularSazonalidade(cyclesHistory)

  // Verão: dez-fev (11,0,1) | Inverno: jun-ago (5,6,7)
  const verao = [11, 0, 1].map(i => sazon[i].media).filter(Boolean)
  const inverno = [5, 6, 7].map(i => sazon[i].media).filter(Boolean)

  if (verao.length === 0 || inverno.length === 0) return null

  const mediaVerao = verao.reduce((a, b) => a + b, 0) / verao.length
  const mediaInverno = inverno.reduce((a, b) => a + b, 0) / inverno.length
  const diff = Math.round(((mediaVerao - mediaInverno) / mediaVerao) * 100)

  return {
    mediaVerao: Math.round(mediaVerao),
    mediaInverno: Math.round(mediaInverno),
    percentualDiff: diff,
    texto: `No inverno, o gás dura em média ${diff}% menos (${Math.round(mediaInverno)} dias vs ${Math.round(mediaVerao)} dias no verão)`
  }
}