import './styles/main.css'
import {
  getData, trySyncPending,
  acaoComprouReserva, acaoInstalouReserva,
  acaoComprouEInstalou, acaoBotijaoTerminou
} from './lib/storage.js'
import { calcularPrevisao, calcularSazonalidade, calcularInsightSazonal } from './lib/estimativa.js'
import Chart from 'chart.js/auto'

// ============================================================
// ESTADO GLOBAL
// ============================================================
let data = null   // o objeto JSON completo
let chart = null
let syncInterval = null

// ============================================================
// UTILITÁRIOS
// ============================================================

function $(id) { return document.getElementById(id) }

function showToast(msg, type = 'default') {
  const t = $('toast')
  t.textContent = msg
  t.className = `toast show ${type}`
  setTimeout(() => { t.className = 'toast' }, 3200)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00')
    .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

const tabs = {
  dashboard: $('tab-dashboard'),
  registrar: $('tab-registrar'),
  historico: $('tab-historico'),
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      Object.values(tabs).forEach(t => t.classList.remove('active'))
      tabs[tab].classList.add('active')
      if (tab === 'historico') renderHistorico()
    })
  })
}

// ============================================================
// LOADING
// ============================================================

function showLoading(msg = 'carregando...') {
  $('screen-loading').style.display = 'flex'
  $('screen-app').style.display = 'none'
  const el = $('loading-msg')
  if (el) el.textContent = msg
}

function hideLoading() {
  $('screen-loading').style.display = 'none'
  $('screen-app').style.display = 'flex'
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
  if (!data) return
  renderBotijaoCard('chuveiro')
  renderBotijaoCard('cozinha')
  renderReserva()
  renderHero()
  $('last-update-text').textContent =
    `atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function getCicloAtivo(local) {
  const est = data.state[local]
  if (!est?.cicloId) return null
  return data.cycles.find(c => c.id === est.cicloId) || null
}

function renderBotijaoCard(local) {
  const ciclo = getCicloAtivo(local)

  const card          = $(`card-${local}`)
  const badge         = $(`badge-${local}`)
  const previsaoEl    = $(`previsao-${local}`)
  const detailEl      = $(`detail-${local}`)
  const confiancaEl   = $(`confianca-${local}`)
  const progressWrap  = $(`progress-wrap-${local}`)
  const fill          = $(`prog-fill-${local}`)
  const labelLeft     = $(`prog-label-left-${local}`)
  const labelRight    = $(`prog-label-right-${local}`)

  if (!ciclo?.dataInstalacao) {
    card.className = 'botijao-card status-inativo'
    badge.className = 'card-badge badge-inativo'
    badge.textContent = 'sem dados'
    previsaoEl.innerHTML = '—'
    detailEl.textContent = 'Registre a instalação para começar'
    confiancaEl.textContent = ''
    progressWrap.style.display = 'none'
    return
  }

  const prev = calcularPrevisao(local, ciclo.dataInstalacao, data.cycles)
  const { diasRestantes, diasPassados, duracaoEstimada, progresso, dataTermino, confianca, amostras } = prev

  let statusClass, badgeClass, badgeText
  if (diasRestantes > 14)      { statusClass = 'status-ok';      badgeClass = 'badge-ok';      badgeText = 'ok' }
  else if (diasRestantes > 7)  { statusClass = 'status-aviso';   badgeClass = 'badge-aviso';   badgeText = 'atenção' }
  else if (diasRestantes >= 0) { statusClass = 'status-critico'; badgeClass = 'badge-critico'; badgeText = 'urgente' }
  else                         { statusClass = 'status-critico'; badgeClass = 'badge-critico'; badgeText = 'vencido' }

  card.className = `botijao-card ${statusClass}`
  badge.className = `card-badge ${badgeClass}`
  badge.textContent = badgeText

  previsaoEl.innerHTML = diasRestantes >= 0
    ? `${diasRestantes}<span class="card-previsao-unit"> dias</span>`
    : `Passou!`

  detailEl.textContent = diasRestantes >= 0
    ? `Término estimado: ${dataTermino.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
    : `Estimativa era ${dataTermino.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`

  const confLabels = {
    alta:  '✦ estimativa confiável',
    media: '◈ estimativa aproximada',
    baixa: '◇ poucos dados — melhorará com o tempo'
  }
  confiancaEl.textContent = amostras > 0 ? confLabels[confianca] : '◇ usando base histórica'

  progressWrap.style.display = 'block'
  const fillColor = statusClass === 'status-ok' ? 'var(--sage)'
    : statusClass === 'status-aviso' ? 'var(--amber)'
    : 'var(--red)'
  fill.style.width = `${Math.round(progresso * 100)}%`
  fill.style.background = fillColor
  labelLeft.textContent  = `${diasPassados}d atrás`
  labelRight.textContent = `${duracaoEstimada}d estimados`
}

function renderReserva() {
  const wrap = $('reserva-icon-wrap')
  const text = $('reserva-status-text')

  if (data.state.reserva === 'em_estoque') {
    wrap.style.background = 'rgba(122,158,126,0.15)'
    wrap.textContent = '🛢️'
    text.style.color = 'var(--sage-dark)'
    text.textContent = 'Em estoque ✓'
  } else {
    wrap.style.background = 'rgba(192,97,74,0.12)'
    wrap.textContent = '⚠️'
    text.style.color = 'var(--red)'
    text.textContent = 'Sem reserva — compre em breve'
  }
}

function renderHero() {
  const heroTitle = $('hero-title')
  const heroEmoji = $('hero-emoji')
  const heroCard  = $('hero-card')

  const locais = ['chuveiro', 'cozinha']
  let minDias = Infinity
  let temAtivo = false

  for (const local of locais) {
    const ciclo = getCicloAtivo(local)
    if (ciclo?.dataInstalacao) {
      temAtivo = true
      const { diasRestantes } = calcularPrevisao(local, ciclo.dataInstalacao, data.cycles)
      if (diasRestantes < minDias) minDias = diasRestantes
    }
  }

  const semReserva = data.state.reserva === 'vazio'

  if (!temAtivo) {
    heroTitle.innerHTML = 'Bem-vindo!<br>Configure os botijões 👇'
    heroEmoji.textContent = '👋'
    heroCard.style.background = 'var(--sage)'
    return
  }

  if (minDias <= 7 || (minDias <= 14 && semReserva)) {
    heroTitle.innerHTML = 'Atenção!<br>Compre gás em breve!'
    heroEmoji.textContent = '😬'
    heroCard.style.background = '#c0614a'
  } else if (minDias <= 14) {
    heroTitle.innerHTML = 'Fique de olho!<br>Reserva ok?'
    heroEmoji.textContent = '🤔'
    heroCard.style.background = 'var(--amber)'
  } else {
    heroTitle.innerHTML = 'Tudo sob<br>controle! 👍'
    heroEmoji.textContent = '😌'
    heroCard.style.background = 'var(--sage)'
  }
}

// ============================================================
// HISTÓRICO
// ============================================================

function renderHistorico() {
  if (!data) return
  renderChart()
  renderInsight()
  renderCyclesList()
}

function renderChart() {
  const sazon = calcularSazonalidade(data.cycles)

  const datasChuveiro = sazon.map(m => {
    const ciclMes = data.cycles.filter(c =>
      c.local === 'chuveiro' && c.duracaoDias &&
      new Date(c.dataInstalacao + 'T12:00:00').getMonth() === m.mes
    )
    return ciclMes.length === 0 ? null
      : Math.round(ciclMes.reduce((a, b) => a + b.duracaoDias, 0) / ciclMes.length)
  })

  const datasCozinha = sazon.map(m => {
    const ciclMes = data.cycles.filter(c =>
      c.local === 'cozinha' && c.duracaoDias &&
      new Date(c.dataInstalacao + 'T12:00:00').getMonth() === m.mes
    )
    return ciclMes.length === 0 ? null
      : Math.round(ciclMes.reduce((a, b) => a + b.duracaoDias, 0) / ciclMes.length)
  })

  // Histórico geral (fallback para meses sem ciclos reais)
  const datasHistorico = sazon.map(m => {
    const temReal = data.cycles.some(c =>
      c.duracaoDias && new Date(c.dataInstalacao + 'T12:00:00').getMonth() === m.mes
    )
    return temReal ? null : m.media
  })

  const ctx = $('chart-sazonal').getContext('2d')
  if (chart) chart.destroy()

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sazon.map(m => m.label),
      datasets: [
        {
          label: 'Chuveiro',
          data: datasChuveiro,
          backgroundColor: 'rgba(88,150,230,0.65)',
          borderColor: 'rgba(88,150,230,0.9)',
          borderWidth: 1.5, borderRadius: 5,
        },
        {
          label: 'Cozinha',
          data: datasCozinha,
          backgroundColor: 'rgba(122,158,126,0.65)',
          borderColor: 'rgba(122,158,126,0.9)',
          borderWidth: 1.5, borderRadius: 5,
        },
        {
          label: 'Base histórica',
          data: datasHistorico,
          backgroundColor: 'rgba(212,137,74,0.3)',
          borderColor: 'rgba(212,137,74,0.6)',
          borderWidth: 1.5, borderRadius: 5,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#9c8578',
            font: { family: 'Nunito', size: 11, weight: '700' },
            boxWidth: 12, padding: 14
          }
        },
        tooltip: {
          callbacks: { label: ctx => ctx.raw != null ? `${ctx.raw} dias` : 'sem dados' }
        }
      },
      scales: {
        x: { ticks: { color: '#9c8578', font: { family: 'Nunito', size: 11, weight: '700' } }, grid: { color: 'rgba(221,213,200,0.5)' } },
        y: { ticks: { color: '#9c8578', font: { family: 'Nunito', size: 11, weight: '700' } }, grid: { color: 'rgba(221,213,200,0.5)' }, beginAtZero: true }
      }
    }
  })
}

function renderInsight() {
  const insight = calcularInsightSazonal(data.cycles)
  const card = $('insight-card')
  if (!insight) { card.style.display = 'none'; return }
  card.style.display = 'flex'
  $('insight-text').textContent = insight.texto
}

function renderCyclesList() {
  const list = $('cycles-list')
  const cycles = data.cycles
    .filter(c => c.dataTermino)
    .sort((a, b) => new Date(b.dataInstalacao) - new Date(a.dataInstalacao))

  if (cycles.length === 0) {
    list.innerHTML = `<p style="color:var(--text-subtle);font-size:14px;font-weight:600;text-align:center;padding:24px 0">
      Nenhum ciclo completo ainda.
    </p>`
    return
  }

  list.innerHTML = cycles.map(c => {
    const cor = c.local === 'chuveiro' ? '#5896e6' : 'var(--sage)'
    const icon = c.local === 'chuveiro' ? '🚿' : '🍳'
    return `
      <div class="cycle-item">
        <div class="cycle-pill" style="background:${cor}"></div>
        <div class="cycle-info">
          <div class="cycle-local">${icon} ${c.local}</div>
          <div class="cycle-dates">${formatDate(c.dataInstalacao)} → ${formatDate(c.dataTermino)}</div>
        </div>
        <div style="text-align:right">
          <div class="cycle-days">${c.duracaoDias}</div>
          <div class="cycle-days-label">dias</div>
        </div>
      </div>`
  }).join('')
}

// ============================================================
// REGISTRAR
// ============================================================

function setupRegistrar() {
  let selectedAction = null
  let selectedLocal  = null

  const actionBtns  = document.querySelectorAll('.action-btn')
  const formContext  = $('form-context')
  const fieldLocal   = $('field-local')
  const fieldObs     = $('field-obs')
  const btnConfirmar = $('btn-confirmar')

  $('reg-data').value = todayStr()

  function updateConfirmar() {
    const needsLocal = ['instalou', 'comprouInstalou', 'terminou'].includes(selectedAction)
    btnConfirmar.disabled = !selectedAction || (needsLocal && !selectedLocal) || !$('reg-data').value
  }

  actionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      actionBtns.forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      selectedAction = btn.dataset.action
      selectedLocal  = null
      document.querySelectorAll('.local-btn').forEach(b => b.classList.remove('selected'))

      const needsLocal = ['instalou', 'comprouInstalou', 'terminou'].includes(selectedAction)
      fieldLocal.style.display = needsLocal ? 'block' : 'none'
      fieldObs.style.display   = selectedAction === 'comprou' ? 'block' : 'none'
      formContext.classList.add('visible')
      updateConfirmar()
    })
  })

  document.querySelectorAll('.local-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.local-btn').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      selectedLocal = btn.dataset.local
      updateConfirmar()
    })
  })

  $('reg-data').addEventListener('change', updateConfirmar)

  btnConfirmar.addEventListener('click', async () => {
    const dataReg = $('reg-data').value
    const obs     = $('reg-obs').value.trim()

    btnConfirmar.disabled = true
    btnConfirmar.textContent = 'Salvando...'

    try {
      let newData

      switch (selectedAction) {
        case 'comprou':
          newData = await acaoComprouReserva(data, dataReg, obs)
          showToast('Compra registrada! ✅', 'success')
          break
        case 'instalou':
          newData = await acaoInstalouReserva(data, selectedLocal, dataReg)
          showToast('Instalação registrada! 🔧', 'success')
          break
        case 'comprouInstalou':
          newData = await acaoComprouEInstalou(data, selectedLocal, dataReg)
          showToast('Compra e instalação registradas! ⚡', 'success')
          break
        case 'terminou':
          newData = await acaoBotijaoTerminou(data, selectedLocal, dataReg)
          showToast('Término registrado 💨', 'success')
          break
      }

      data = newData

      // Reset form
      actionBtns.forEach(b => b.classList.remove('selected'))
      document.querySelectorAll('.local-btn').forEach(b => b.classList.remove('selected'))
      formContext.classList.remove('visible')
      fieldLocal.style.display = 'none'
      fieldObs.style.display   = 'none'
      $('reg-data').value = todayStr()
      $('reg-obs').value  = ''
      selectedAction = null
      selectedLocal  = null

      // Vai pro dashboard e renderiza
      document.querySelector('[data-tab="dashboard"]').click()

    } catch (e) {
      showToast('Erro ao salvar. Verifique sua conexão.', 'error')
      console.error(e)
    } finally {
      btnConfirmar.textContent = 'Confirmar'
      updateConfirmar()
    }
  })
}

// ============================================================
// SYNC PERIÓDICO (puxa dados a cada 60s se app estiver aberto)
// ============================================================
function startSyncInterval() {
  if (syncInterval) clearInterval(syncInterval)
  syncInterval = setInterval(async () => {
    try {
      const fresh = await getData()
      data = fresh
      renderDashboard()
    } catch (_) { /* silencia, já tem cache */ }
  }, 60_000)
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  showLoading()

  try {
    await trySyncPending()
    data = await getData()
  } catch (e) {
    showToast('Sem conexão — usando dados locais', 'error')
    console.warn(e)
  }

  hideLoading()
  setupNav()
  setupRegistrar()
  renderDashboard()
  startSyncInterval()
}

boot()