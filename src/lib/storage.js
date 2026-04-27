// ============================================================
// storage.js — JSONBin.io como backend
//
// Setup (1 vez só):
//  1. Crie conta gratuita em https://jsonbin.io
//  2. Vá em API Keys → crie uma Master Key
//  3. Crie um novo Bin com o conteúdo inicial abaixo
//  4. Copie o Bin ID da URL
//  5. Preencha as constantes JSONBIN_KEY e JSONBIN_BIN_ID
//     no arquivo .env (ou direto aqui se preferir)
// ============================================================

import localforage from 'localforage'

const JSONBIN_KEY    = import.meta.env.VITE_JSONBIN_KEY    || ''
const JSONBIN_BIN_ID = import.meta.env.VITE_JSONBIN_BIN_ID || ''
const BASE_URL       = JSONBIN_BIN_ID ? `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}` : ''

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Master-Key': JSONBIN_KEY,
  'X-Bin-Versioning': 'false'   // sempre sobrescreve, sem histórico de versões
}

// Estrutura inicial do bin — cole isso ao criar o bin no JSONBin
export const EMPTY_DATA = {
  state: {
    chuveiro: null,   // { cicloId, dataInstalacao }
    cozinha:  null,   // { cicloId, dataInstalacao }
    reserva:  'vazio' // 'em_estoque' | 'vazio'
  },
  cycles: [],     // todos os ciclos (ativos e concluídos)
  purchases: []   // todas as compras
}

// ============================================================
// Cache local (offline-first)
// ============================================================
const CACHE_KEY = 'gas-tracker-data'

async function getCache() {
  return await localforage.getItem(CACHE_KEY)
}

async function setCache(data) {
  await localforage.setItem(CACHE_KEY, data)
}

// ============================================================
// Ler dados (JSONBin → fallback para cache local)
// ============================================================
export async function getData() {
  if (!JSONBIN_BIN_ID) {
    const cached = await getCache()
    return cached || structuredClone(EMPTY_DATA)
  }

  try {
    const res = await fetch(`${BASE_URL}/latest`, { headers: HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const data = json.record
    await setCache(data)
    return data
  } catch (e) {
    console.warn('JSONBin offline, usando cache local:', e.message)
    const cached = await getCache()
    return cached || structuredClone(EMPTY_DATA)
  }
}

// ============================================================
// Salvar dados (JSONBin + cache local simultaneamente)
// ============================================================
export async function saveData(data) {
  await setCache(data)

  if (!JSONBIN_BIN_ID) return

  try {
    const res = await fetch(BASE_URL, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e) {
    console.warn('Falha ao salvar no JSONBin, ficou só no cache:', e.message)
    await localforage.setItem('gas-tracker-pending-sync', true)
    throw e
  }
}

// ============================================================
// Retry de sync pendente (chama ao abrir o app)
// ============================================================
export async function trySyncPending() {
  if (!JSONBIN_BIN_ID) return

  const pending = await localforage.getItem('gas-tracker-pending-sync')
  if (!pending) return

  try {
    const cached = await getCache()
    if (!cached) return

    const res = await fetch(BASE_URL, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify(cached)
    })
    if (res.ok) {
      await localforage.removeItem('gas-tracker-pending-sync')
      console.log('Sync pendente enviado com sucesso')
    }
  } catch (e) {
    console.warn('Sync pendente ainda falhou:', e.message)
  }
}

// ============================================================
// AÇÕES — todas operam sobre o objeto `data` e chamam saveData
// ============================================================

function newId() {
  return crypto.randomUUID()
}

function hoje() {
  return new Date().toISOString().split('T')[0]
}

/**
 * "Comprei o reserva"
 */
export async function acaoComprouReserva(data, dataCompra, observacao = '') {
  const d = structuredClone(data)
  d.purchases.push({ id: newId(), data: dataCompra, observacao, criadoEm: new Date().toISOString() })
  d.state.reserva = 'em_estoque'
  await saveData(d)
  return d
}

/**
 * "Instalei o reserva" no chuveiro ou cozinha
 * Fecha ciclo anterior e abre novo
 */
export async function acaoInstalouReserva(data, local, dataInstalacao) {
  const d = structuredClone(data)

  // Fecha ciclo anterior do local se existir
  const estadoLocal = d.state[local]
  if (estadoLocal?.cicloId) {
    const ciclo = d.cycles.find(c => c.id === estadoLocal.cicloId)
    if (ciclo && !ciclo.dataTermino) {
      ciclo.dataTermino = dataInstalacao
      const inst = new Date(ciclo.dataInstalacao + 'T12:00:00')
      const term = new Date(dataInstalacao + 'T12:00:00')
      ciclo.duracaoDias = Math.round((term - inst) / 86400000)
    }
  }

  // Abre novo ciclo
  const novoCicloId = newId()
  d.cycles.push({
    id: novoCicloId,
    local,
    dataInstalacao,
    dataTermino: null,
    duracaoDias: null,
    criadoEm: new Date().toISOString()
  })

  d.state[local] = { cicloId: novoCicloId, dataInstalacao }
  d.state.reserva = 'vazio'

  await saveData(d)
  return d
}

/**
 * "Comprei e já instalei" — compra + instalação no mesmo ato
 */
export async function acaoComprouEInstalou(data, local, dataInstalacao) {
  const d = structuredClone(data)
  d.purchases.push({
    id: newId(),
    data: dataInstalacao,
    observacao: `Instalado direto no(a) ${local}`,
    criadoEm: new Date().toISOString()
  })
  await saveData(d)  // salva compra primeiro
  return acaoInstalouReserva(d, local, dataInstalacao)
}

/**
 * "Botijão terminou" sem reserva
 */
export async function acaoBotijaoTerminou(data, local, dataTermino) {
  const d = structuredClone(data)

  const estadoLocal = d.state[local]
  if (estadoLocal?.cicloId) {
    const ciclo = d.cycles.find(c => c.id === estadoLocal.cicloId)
    if (ciclo && !ciclo.dataTermino) {
      ciclo.dataTermino = dataTermino
      const inst = new Date(ciclo.dataInstalacao + 'T12:00:00')
      const term = new Date(dataTermino + 'T12:00:00')
      ciclo.duracaoDias = Math.round((term - inst) / 86400000)
    }
  }

  d.state[local] = null

  await saveData(d)
  return d
}
