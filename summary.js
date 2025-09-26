import { currentRoundAccuracy, state } from './state.js'
import { drawLineChart } from './charts.js'

const summaryModal = document.getElementById('summaryModal')
const sumBody = document.getElementById('sumBody')
const speedChart = document.getElementById('speedChart')
const accuracyChart = document.getElementById('accuracyChart')
const closeSummaryBtn = document.getElementById('closeSummary')

export function bindSummary(){
  closeSummaryBtn.addEventListener('click', hideSummary)
  summaryModal.addEventListener('click', (e) => { if(e.target === summaryModal) hideSummary() })
}

export function showSummary(){
  const entries = state.roundEntries.slice(-20)
  const solved = entries.filter(e => e.ok).length
  const total = entries.length
  const avg = entries.filter(e => e.ok).reduce((acc, cur) => acc + cur.ms, 0) / Math.max(1, solved)
  const accuracy = currentRoundAccuracy()
  sumBody.innerHTML = `
    <div class="row">
      <div class="stat">Solved: <span class="hl">${solved}/${total}</span></div>
      <div class="stat">Accuracy: <span class="hl">${(accuracy*100).toFixed(0)}%</span></div>
      <div class="stat">Avg speed: <span class="hl">${isFinite(avg)?(avg/1000).toFixed(2)+'s':'--'}</span></div>
    </div>
    <div class="stat">Modes tackled: ${Array.from(new Set(entries.map(e=>e.mode))).join(', ') || '--'}</div>
  `
  drawSpeedChart(entries)
  drawAccuracyChart(state.hist.slice(-30))
  summaryModal.classList.add('show')
}

export function hideSummary(){
  summaryModal.classList.remove('show')
}

function drawSpeedChart(entries){
  if(!speedChart) return
  const data = entries.map(e => +(e.ms/1000).toFixed(2))
  if(!data.length){
    const ctx = speedChart.getContext('2d')
    ctx.clearRect(0,0,speedChart.width,speedChart.height)
    return
  }
  const max = Math.max(...data)
  const min = Math.min(...data)
  drawLineChart(speedChart, data, {
    color:'#6ee7ff',
    min: Math.max(0, min - 0.2),
    max: max + 0.2,
    markers:true,
    formatter:(v)=>`${v.toFixed(2)}s`
  })
}

function drawAccuracyChart(history){
  if(!accuracyChart) return
  if(!history.length){
    const ctx = accuracyChart.getContext('2d')
    ctx.clearRect(0,0,accuracyChart.width,accuracyChart.height)
    return
  }
  const rolling = []
  history.forEach((entry, idx) => {
    const slice = history.slice(0, idx+1)
    const acc = slice.filter(e=>e.ok).length / slice.length
    rolling.push(Number((acc*100).toFixed(1)))
  })
  drawLineChart(accuracyChart, rolling, {
    color:'#52ffa8',
    min: Math.max(0, Math.min(...rolling) - 5),
    max: Math.min(100, Math.max(...rolling) + 5),
    markers:true,
    formatter:(v)=>`${v.toFixed(1)}%`
  })
}
