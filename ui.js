import { achievementSummaries } from './achievements.js'
import { currentRoundAccuracy, difficultyAllowedModes, saveState, setTheme, state } from './state.js'

const elements = {
  bits: document.getElementById('bits'),
  pvRow: document.getElementById('pvRow'),
  prompt: document.getElementById('prompt'),
  taskTag: document.getElementById('taskTag'),
  assistHint: document.getElementById('assistHint'),
  answer: document.getElementById('answer'),
  result: document.getElementById('result'),
  checkBtn: document.getElementById('checkBtn'),
  nextBtn: document.getElementById('nextBtn'),
  resetBtn: document.getElementById('resetBtn'),
  answerBase: document.getElementById('answerBase'),
  difficulty: document.getElementById('difficulty'),
  roundLen: document.getElementById('roundLen'),
  levelChip: document.getElementById('levelChip'),
  streakChip: document.getElementById('streakChip'),
  achChip: document.getElementById('achChip'),
  accuracyChip: document.getElementById('accuracyChip'),
  showPV: document.getElementById('showPV'),
  strict: document.getElementById('strict'),
  assist: document.getElementById('assist'),
  badgeRow: document.getElementById('badgeRow'),
  time: document.getElementById('time'),
  best: document.getElementById('best'),
  overallAcc: document.getElementById('overallAcc'),
  roundAcc: document.getElementById('roundAcc'),
  xp: document.getElementById('xp'),
  timerFill: document.getElementById('timerfill'),
  timerBar: document.getElementById('timerBar'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  themeToggle: document.getElementById('themeToggle'),
  autoExplain: document.getElementById('autoExplain'),
  noTimer: document.getElementById('noTimer'),
  summaryModal: document.getElementById('summaryModal'),
  explainModal: document.getElementById('explainModal'),
  explainBody: document.getElementById('explainBody'),
  closeExplain: document.getElementById('closeExplain'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
}

let bitChangeHandler = null

export function getElements(){
  return elements
}

export function onBitsChanged(cb){
  bitChangeHandler = cb
}

export function renderQuestion(question){
  elements.prompt.textContent = question.prompt
  const taskLabel = elements.taskTag?.querySelector(\".task-text\")
  if(taskLabel) taskLabel.textContent = question.task
  renderBits(question)
  elements.answer.value = ''
  clearAnswerFeedback()
  elements.result.textContent = ''
  setAssistHint('')
  if(question.validBases && !question.validBases.includes(elements.answerBase.value)){
    setAnswerBase(question.validBases[0])
  }
  elements.answer.setAttribute('aria-label', `Answer in ${state.answerBase}`)
}

function renderBits(question){
  const container = elements.bits
  container.innerHTML = ''
  const groups = question.bitGroups || []
  if(!groups.length){
    elements.pvRow.textContent = ''
    container.setAttribute('aria-hidden','true')
    return
  }
  container.setAttribute('aria-hidden','false')
  let globalIndex = 0
  groups.forEach(group => {
    group.bits.split('').forEach((bit, idx) => {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'bit' + (bit === '1' ? ' on' : '')
      cell.dataset.index = String(globalIndex)
      cell.dataset.group = group.label || ''
      cell.dataset.local = String(idx)
      cell.setAttribute('role','gridcell')
      cell.setAttribute('aria-pressed', bit === '1' ? 'true' : 'false')

      const value = document.createElement('span')
      value.className = 'bit-value'
      value.textContent = bit

      const pv = document.createElement('span')
      pv.className = 'pv'
      pv.textContent = elements.showPV.checked ? bitPlaceValue(group.bits.length, idx) : ''

      cell.append(value, pv)

      if(question.acceptsBits){
        cell.addEventListener('click', () => toggleBit(cell))
      } else {
        cell.disabled = true
      }
      cell.addEventListener('keydown', (e) => {
        if(!question.acceptsBits) return
        if(e.key === ' ' || e.key === 'Enter'){
          e.preventDefault()
          toggleBit(cell)
        }
        if(e.key === '0' || e.key === '1'){
          e.preventDefault()
          setBit(cell, e.key)
        }
      })
      container.appendChild(cell)
      globalIndex += 1
    })
  })
  refreshPV(question)
}

function bitPlaceValue(groupLength, idx){
  const power = groupLength - idx - 1
  return Math.pow(2, power)
}

function toggleBit(cell){
  const bit = cell.firstChild.textContent === '1' ? '0' : '1'
  setBit(cell, bit)
}

function setBit(cell, bit){
  cell.firstChild.textContent = bit
  cell.classList.toggle('on', bit === '1')
  cell.setAttribute('aria-pressed', bit === '1' ? 'true' : 'false')
  cell.classList.add('flip')
  setTimeout(() => cell.classList.remove('flip'), 200)
  if(typeof bitChangeHandler === 'function'){
    bitChangeHandler(getBits())
  }
}

export function getBits(){
  return Array.from(elements.bits.querySelectorAll('.bit')).map(cell => cell.classList.contains('on') ? '1' : '0').join('')
}

export function setBits(binary){
  Array.from(elements.bits.querySelectorAll('.bit')).forEach((cell, idx) => {
    const bit = binary[idx] || '0'
    cell.firstChild.textContent = bit
    cell.classList.toggle('on', bit === '1')
    cell.setAttribute('aria-pressed', bit === '1' ? 'true' : 'false')
  })
}

export function highlightBits(indices){
  const set = new Set(indices || [])
  Array.from(elements.bits.querySelectorAll('.bit')).forEach((cell, idx) => {
    cell.classList.toggle('hl', set.has(idx))
  })
}

export function refreshPV(question){
  if(!elements.showPV.checked){
    elements.pvRow.textContent = ''
    return
  }
  const groups = question?.bitGroups || []
  const pv = groups.flatMap(group => group.bits.split('').map((_, idx) => bitPlaceValue(group.bits.length, idx)))
  elements.pvRow.textContent = pv.join('  ')
}

export function updateStatus(){
  elements.levelChip.textContent = `Level ${state.level}`
  elements.streakChip.textContent = `Streak ${state.streak}`
  elements.xp.textContent = state.xp
  elements.best.textContent = state.best ? `${(state.best/1000).toFixed(2)}s` : '--'
  const currentAcc = currentRoundAccuracy()
  elements.accuracyChip.textContent = `Accuracy ${(currentAcc*100).toFixed(0)}%`
  elements.roundAcc.textContent = `${(currentAcc*100).toFixed(0)}%`
  const overall = state.hist.length ? state.hist.filter(e => e.ok).length / state.hist.length : 0
  if(elements.overallAcc){
    elements.overallAcc.textContent = `${(overall*100).toFixed(0)}%`
  }
  if(elements.noTimer){
    elements.noTimer.checked = state.noTimer
    if(elements.roundLen) elements.roundLen.disabled = state.noTimer
  }
  if(elements.assist){
    elements.assist.checked = state.assist
  }
  updateBadges()
  updateTabs()
}

function updateBadges(){
  const summaries = achievementSummaries()
  const earned = summaries.filter(item => item.unlocked)
  elements.achChip.textContent = `${earned.length} trophies`
  if(!earned.length){
    elements.badgeRow.textContent = 'No achievements yet'
    return
  }
  elements.badgeRow.innerHTML = earned.map(item => `<div class="stat"><span class="hl">${item.label}</span> - ${item.desc}</div>`).join('')
}

function updateTabs(){
  const suggested = new Set(difficultyAllowedModes(state.difficulty))
  elements.tabs.forEach((tab, idx) => {
    tab.setAttribute('aria-disabled', 'false')
    tab.classList.remove('locked')
    tab.classList.toggle('suggested', suggested.has(tab.dataset.mode))
    tab.dataset.shortcut = String(idx + 1)
  })
}

export function setActiveTab(mode){
  elements.tabs.forEach(tab => {
    const active = tab.dataset.mode === mode
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', active ? 'true' : 'false')
  })
}

export function setAnswerBase(value){
  state.answerBase = value
  if(elements.answerBase && elements.answerBase.value !== value){
    elements.answerBase.value = value
  }
}

export function setDifficulty(value){
  state.difficulty = value
  if(elements.difficulty && elements.difficulty.value !== value){
    elements.difficulty.value = value
  }
}

export function setTimerDisplay(seconds, fraction){
  if(state.noTimer){
    elements.time.textContent = 'Timer off'
    elements.timerFill.style.transform = 'scaleX(0)'
    elements.timerBar.setAttribute('aria-valuenow', '0')
    elements.timerBar.setAttribute('aria-hidden', 'true')
    elements.timerBar.classList.add('no-timer')
    return
  }
  const clamped = Math.max(0, Math.min(1, fraction))
  elements.time.textContent = `${seconds.toFixed(1)}s`
  elements.timerFill.style.transform = `scaleX(${clamped})`
  elements.timerBar.setAttribute('aria-valuenow', String(Math.round(clamped*100)))
  elements.timerBar.setAttribute('aria-hidden', 'false')
  elements.timerBar.classList.remove('no-timer')
}

export function setAssistHint(text){
  if(!elements.assistHint) return
  if(text){
    elements.assistHint.textContent = text
    elements.assistHint.classList.add('show')
    elements.assistHint.setAttribute('aria-hidden', 'false')
  } else {
    elements.assistHint.textContent = ''
    elements.assistHint.classList.remove('show')
    elements.assistHint.setAttribute('aria-hidden', 'true')
  }
}

export function setResultMessage(message, status){
  elements.result.innerHTML = message
  if(status === 'ok'){
    elements.answer.classList.add('okay')
    elements.answer.classList.remove('nope')
  } else if(status === 'bad'){
    elements.answer.classList.add('nope')
    elements.answer.classList.remove('okay')
  } else {
    clearAnswerFeedback()
  }
}

export function clearAnswerFeedback(){
  elements.answer.classList.remove('okay', 'nope')
}

export function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme)
  state.theme = theme
  elements.themeToggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode'
  elements.themeToggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false')
  saveState()
}

export function toggleTheme(){
  const next = state.theme === 'dark' ? 'light' : 'dark'
  setTheme(next)
  applyTheme(next)
}

export function updateAssistLabel(){
  elements.assist.setAttribute('aria-checked', elements.assist.checked ? 'true' : 'false')
}

export function showExplanation(steps){
  if(!steps?.length) return
  elements.explainBody.innerHTML = steps.map(step => `<div>${step}</div>`).join('')
  elements.explainModal.classList.add('show')
}

export function hideExplanation(){
  elements.explainModal.classList.remove('show')
}

export function bindExplanation(){
  elements.closeExplain.addEventListener('click', hideExplanation)
  elements.explainModal.addEventListener('click', (e) => {
    if(e.target === elements.explainModal) hideExplanation()
  })
}

export function announce(message){
  elements.result.textContent = message
}

export function updateRoundAccuracy(){
  const acc = currentRoundAccuracy()
  elements.roundAcc.textContent = `${(acc*100).toFixed(0)}%`
  elements.accuracyChip.textContent = `Accuracy ${(acc*100).toFixed(0)}%`
}

updateTabs()
bindExplanation()

export { elements }







