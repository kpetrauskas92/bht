import { evaluateAchievements, roundComplete } from './achievements.js'
import { generateQuestion, evaluateAnswer } from './questions.js'
import {
  state,
  loadState,
  saveState,
  resetProgress,
  resetRound,
  recordResult,
  awardXp,
  xpForDifficulty,
  roundTimeMultiplier,
  exportState,
  importState,
  setAutoExplain,
} from './state.js'
import {
  getElements,
  onBitsChanged,
  renderQuestion as renderUIQuestion,
  setActiveTab,
  setAnswerBase,
  setDifficulty,
  setTimerDisplay,
  setResultMessage,
  applyTheme,
  toggleTheme,
  updateStatus,
  getBits,
  highlightBits,
  updateAssistLabel,
  showExplanation,
  updateRoundAccuracy,
  refreshPV,
  setAssistHint,
} from './ui.js'
import { bindSummary, showSummary } from './summary.js'

const elements = getElements()
let roundDurationMs = state.roundLen * 1000
let ticking = false

init()

function init(){
  loadState()
  applyTheme(state.theme)
  setAnswerBase(state.answerBase)
  setDifficulty(state.difficulty)
  elements.roundLen.value = state.roundLen
  elements.autoExplain.checked = state.autoExplain
  elements.assist.checked = state.assist
  updateAssistLabel()
  updateStatus()
  bindEvents()
  bindSummary()
  startRound()
}

function bindEvents(){
  elements.checkBtn.addEventListener('click', checkAnswer)
  elements.nextBtn.addEventListener('click', () => nextQuestion(true))
  elements.resetBtn.addEventListener('click', resetProgress)

  elements.answerBase.addEventListener('change', (e) => {
    setAnswerBase(e.target.value)
    saveState()
    nextQuestion(true)
  })

  elements.difficulty.addEventListener('change', (e) => {
    setDifficulty(e.target.value)
    saveState()
    updateStatus()
    startRound()
  })

  elements.roundLen.addEventListener('change', (e) => {
    const value = clampNumber(Number(e.target.value), 5, 120)
    state.roundLen = value
    e.target.value = value
    saveState()
    if(!state.noTimer){
      startRound()
    }
  })

  if(elements.noTimer){
    elements.noTimer.addEventListener('change', () => {
      state.noTimer = elements.noTimer.checked
      saveState()
      if(state.noTimer){
        disableTimer({ newQuestion: true })
      } else {
        startRound()
      }
    })
  }

  elements.themeToggle.addEventListener('click', toggleTheme)

  elements.showPV.addEventListener('change', () => {
    if(state.currentQuestion) refreshPV(state.currentQuestion)
  })

  elements.strict.addEventListener('change', () => {
    if(!state.noTimer) startRound()
  })

  elements.assist.addEventListener('change', () => {
    state.assist = elements.assist.checked
    updateAssistLabel()
    saveState()
    renderAssistHint()
  })

  elements.autoExplain.addEventListener('change', (e) => {
    setAutoExplain(e.target.checked)
    renderAssistHint()
  })

  elements.exportBtn.addEventListener('click', handleExport)
  elements.importInput.addEventListener('change', handleImport)

  elements.tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab)))

  document.addEventListener('keydown', handleGlobalKeys)

  onBitsChanged((bits) => {
    if(state.answerBase === 'bin'){
      elements.answer.value = formatBinaryForMode(bits, state.mode)
    }
  })
}

function handleGlobalKeys(e){
  const tag = e.target?.tagName
  const isFormControl = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'

  if(e.key === 'Enter'){
    if(e.target === elements.answer){
      e.preventDefault()
      if(elements.answer.value.trim()) checkAnswer()
      else nextQuestion(true)
      return
    }
    if(!isFormControl){
      e.preventDefault()
      checkAnswer()
      return
    }
  }

  if(isFormControl) return

  if(e.key === 'n' || e.key === 'N'){
    e.preventDefault()
    nextQuestion(true)
    return
  }

  if(/^[1-7]$/.test(e.key)){
    const idx = Number(e.key) - 1
    const tab = elements.tabs[idx]
    if(tab) selectTab(tab)
  }
}

function selectTab(tab){
  if(tab.getAttribute('aria-disabled') === 'true') return
  state.mode = tab.dataset.mode
  setActiveTab(state.mode)
  nextQuestion(true)
}

function startRound(){
  resetRound()
  updateRoundAccuracy()
  if(state.noTimer){
    disableTimer({ newQuestion: true, skipReset: true })
    return
  }
  roundDurationMs = computeRoundDuration()
  if(state.timerId) cancelAnimationFrame(state.timerId)
  state.roundEndAt = performance.now() + roundDurationMs
  ticking = true
  tick()
  nextQuestion(true)
}

function computeRoundDuration(){
  const strictFactor = elements.strict.checked ? 0.85 : 1
  return state.roundLen * 1000 * roundTimeMultiplier(state.difficulty) * strictFactor
}

function disableTimer({ newQuestion = false, skipReset = false } = {}){
  ticking = false
  if(state.timerId) cancelAnimationFrame(state.timerId)
  state.timerId = null
  state.roundEndAt = Infinity
  if(!skipReset){
    resetRound()
    updateRoundAccuracy()
  }
  setTimerDisplay(0, 0)
  updateStatus()
  if(newQuestion){
    nextQuestion(true)
  } else {
    renderAssistHint()
  }
}

function tick(){
  if(!ticking || state.noTimer) return
  const now = performance.now()
  const remaining = Math.max(0, state.roundEndAt - now)
  const fraction = remaining / roundDurationMs
  setTimerDisplay(remaining / 1000, fraction)
  if(remaining <= 0){
    endRound()
    return
  }
  state.timerId = requestAnimationFrame(tick)
}

function endRound(){
  if(state.noTimer) return
  ticking = false
  if(state.timerId) cancelAnimationFrame(state.timerId)
  setTimerDisplay(0, 0)
  const total = state.solved + state.wrong
  setResultMessage(`Round over - solved ${state.solved}/${total}`, null)
  roundComplete()
  saveState()
  showSummary()
  startRound()
}

function nextQuestion(force = false){
  if(!force && elements.answer.value.trim()){
    elements.answer.select()
    return
  }
  state.currentQuestion = generateQuestion()
  renderUIQuestion(state.currentQuestion)
  highlightBits([])
  renderAssistHint(state.currentQuestion)
  setActiveTab(state.mode)
  state.startAt = performance.now()
  updateStatus()
  elements.answer.focus()
}

function checkAnswer(){
  if(!state.currentQuestion) return
  const userInput = elements.answer.value.trim()
  const elapsed = performance.now() - state.startAt
  const result = evaluateAnswer(state.currentQuestion, userInput, state.answerBase, { bitsFromGrid: getBits() })
  if(result.ok){
    handleCorrect(elapsed)
  } else {
    handleWrong(result, elapsed)
  }
}

function handleCorrect(ms){
  const xpGain = xpForDifficulty(state.difficulty)
  awardXp(xpGain)
  recordResult({ mode: state.mode, ok: true, ms, difficulty: state.difficulty })
  evaluateAchievements({ ok: true, ms })
  setResultMessage(`Correct! +${xpGain} XP`, 'ok')
  if(state.currentQuestion?.highlight?.length){
    highlightBits(state.currentQuestion.highlight)
    setTimeout(() => highlightBits([]), 400)
  }
  updateRoundAccuracy()
  updateStatus()
  saveState()
  setTimeout(() => nextQuestion(true), 250)
}

function handleWrong(result, elapsed){
  recordResult({ mode: state.mode, ok: false, ms: elapsed, difficulty: state.difficulty })
  const base = state.currentQuestion?.forcedBase || state.answerBase
  const expected = result.expected ? formatExpected(result.expected, base) : 'n/a'
  setResultMessage(`Incorrect. Correct answer: <span class="hl">${expected}</span>`, 'bad')
  if(state.currentQuestion?.highlight?.length){
    highlightBits(state.currentQuestion.highlight)
  }
  updateRoundAccuracy()
  updateStatus()
  saveState()
  if(state.autoExplain && state.currentQuestion?.explanation?.length){
    showExplanation(state.currentQuestion.explanation)
  }
  renderAssistHint(state.currentQuestion)
}

function formatExpected(value, base){
  if(base === 'bin') return formatBinaryForMode(value, state.mode)
  if(base === 'hex') return value.toUpperCase()
  return value
}

function formatBinaryForMode(bits, mode){
  if(!bits) return ''
  if(mode === 'ipv4' || mode === 'mask'){
    return bits.match(/.{1,8}/g)?.join(' ') || bits
  }
  if(mode === 'ipv6'){
    return bits.match(/.{1,16}/g)?.join(' ') || bits
  }
  return bits.match(/.{1,4}/g)?.join(' ') || bits
}

function renderAssistHint(question = state.currentQuestion){
  const hints = []
  if(state.assist && question){
    const first = question.explanation?.[0]
    if(first) hints.push(first)
    else if(question.task) hints.push(question.task)
  }
  if(state.autoExplain){
    hints.push('Step-through on: we will break it down after mistakes.')
  }
  setAssistHint(hints.length ? hints.join(' | ') : '')
}

function handleExport(){
  const blob = new Blob([exportState()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `binary-hex-trainer-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function handleImport(event){
  const file = event.target.files?.[0]
  if(!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      importState(reader.result)
      applyTheme(state.theme)
      setAnswerBase(state.answerBase)
      setDifficulty(state.difficulty)
      elements.roundLen.value = state.roundLen
      elements.autoExplain.checked = state.autoExplain
      elements.assist.checked = state.assist
      updateAssistLabel()
      updateStatus()
      startRound()
    } catch (err) {
      alert(err.message)
    }
  }
  reader.readAsText(file)
}

function clampNumber(value, min, max){
  if(Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}
