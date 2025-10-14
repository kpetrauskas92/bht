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
  setKidModeUI,
  setKidMessage,
  setKidStars,
  updateKidSubnetLab,
} from './ui.js'
import { bindSummary, showSummary } from './summary.js'

const elements = getElements()
const KID_ALLOWED_MODES = ['octet', 'subnet']
const KID_PRAISES = [
  'Yay! You made the lights sparkle! 🎉',
  'High paw! Buddy Bear is proud of you! 🐾',
  'Fantastic! You solved the puzzle! 🌟',
]
const KID_ENCOURAGEMENTS = [
  "Almost there! Let's peek together.",
  'No worries, try again with Buddy Bear!',
  "Oops! Let's flip the switches slowly.",
]
let roundDurationMs = state.roundLen * 1000
let ticking = false
let savedAdultSettings = null

init()

function init(){
  loadState()
  applyTheme(state.theme)
  setKidModeUI(state.kidMode)
  if(state.kidMode){
    applyKidModeDefaults({ fromInit: true })
  }
  setAnswerBase(state.answerBase)
  setDifficulty(state.difficulty)
  elements.roundLen.value = state.roundLen
  elements.autoExplain.checked = state.autoExplain
  elements.assist.checked = state.assist
  updateAssistLabel()
  updateStatus()
  bindEvents()
  bindSummary()
  if(elements.kidSubnetSlider){
    updateKidSubnetLab(Number(elements.kidSubnetSlider.value))
  }
  startRound()
}

function bindEvents(){
  elements.checkBtn.addEventListener('click', checkAnswer)
  elements.nextBtn.addEventListener('click', () => nextQuestion(true))
  elements.resetBtn.addEventListener('click', resetProgress)

  elements.answerBase.addEventListener('change', (e) => {
    if(state.kidMode){
      setAnswerBase('dec')
      elements.answerBase.value = 'dec'
      return
    }
    setAnswerBase(e.target.value)
    saveState()
    nextQuestion(true)
  })

  elements.difficulty.addEventListener('change', (e) => {
    if(state.kidMode){
      setDifficulty('easy')
      elements.difficulty.value = 'easy'
      return
    }
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
      if(state.kidMode){
        elements.noTimer.checked = true
        return
      }
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

  if(elements.kidToggle){
    elements.kidToggle.addEventListener('click', toggleKidMode)
  }

  elements.showPV.addEventListener('change', () => {
    if(state.currentQuestion) refreshPV(state.currentQuestion)
  })

  elements.strict.addEventListener('change', () => {
    if(!state.noTimer) startRound()
  })

  elements.assist.addEventListener('change', () => {
    if(state.kidMode){
      elements.assist.checked = true
      return
    }
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

  if(elements.kidSubnetSlider){
    elements.kidSubnetSlider.addEventListener('input', () => {
      updateKidSubnetLab(Number(elements.kidSubnetSlider.value))
    })
  }

  elements.tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab)))

  document.addEventListener('keydown', handleGlobalKeys)

  onBitsChanged((bits) => {
    if(state.answerBase === 'bin'){
      elements.answer.value = formatBinaryForMode(bits, state.mode)
    }
  })
}

function handleGlobalKeys(e){
  if(e.defaultPrevented) return
  const tag = e.target?.tagName
  const isFormControl = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
  const isEditable = e.target?.isContentEditable
  const isButtonLike = typeof e.target?.closest === 'function' && e.target.closest('button, a, [role="button"], [role="link"], [data-action]')

  if(e.key === 'Enter'){
    if(e.target === elements.answer){
      e.preventDefault()
      if(elements.answer.value.trim()) checkAnswer()
      else nextQuestion(true)
      return
    }
    if(isFormControl || isEditable || isButtonLike){
      return
    }
    if(!isFormControl && !isEditable && !isButtonLike){
      e.preventDefault()
      checkAnswer()
      return
    }
  }

  if(isFormControl || isEditable || isButtonLike) return

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
  if(state.kidMode && !KID_ALLOWED_MODES.includes(tab.dataset.mode)) return
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
  updateKidExperience(state.currentQuestion)
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
  if(state.kidMode){
    setKidMessage(pickKidPraise(), 'celebrate')
    setKidStars(state.streak)
  }
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
  if(state.kidMode){
    setKidMessage(pickKidEncouragement(), 'think')
    setKidStars(state.streak)
  }
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

function updateKidExperience(question){
  if(!state.kidMode){
    setKidMessage('')
    return
  }
  const story = question?.kidStory || question?.kidTask || 'Let’s play with shiny switches!'
  setKidMessage(story, 'guide')
  setKidStars(state.streak)
}

function pickKidPraise(){
  return KID_PRAISES[Math.floor(Math.random() * KID_PRAISES.length)]
}

function pickKidEncouragement(){
  return KID_ENCOURAGEMENTS[Math.floor(Math.random() * KID_ENCOURAGEMENTS.length)]
}

function applyKidModeDefaults({ fromInit = false } = {}){
  if(!fromInit && !savedAdultSettings){
    savedAdultSettings = {
      difficulty: state.difficulty,
      answerBase: state.answerBase,
      noTimer: state.noTimer,
      assist: state.assist,
      mode: state.mode,
    }
  }
  state.kidMode = true
  setKidModeUI(true)
  state.noTimer = true
  if(elements.noTimer){
    elements.noTimer.checked = true
  }
  state.assist = true
  if(elements.assist){
    elements.assist.checked = true
  }
  updateAssistLabel()
  setDifficulty('easy')
  setAnswerBase('dec')
  if(!KID_ALLOWED_MODES.includes(state.mode)){
    state.mode = 'octet'
  }
  setKidStars(state.streak)
  setKidMessage('Let’s play with shiny switches!', 'guide')
  if(elements.kidSubnetSlider){
    updateKidSubnetLab(Number(elements.kidSubnetSlider.value))
  }
}

function toggleKidMode(){
  if(state.kidMode){
    disableKidMode()
  } else {
    applyKidModeDefaults()
    saveState()
    updateStatus()
    startRound()
  }
}

function disableKidMode(){
  state.kidMode = false
  setKidModeUI(false)
  if(savedAdultSettings){
    setDifficulty(savedAdultSettings.difficulty)
    setAnswerBase(savedAdultSettings.answerBase)
    state.noTimer = savedAdultSettings.noTimer
    if(elements.noTimer){
      elements.noTimer.checked = state.noTimer
    }
    state.assist = savedAdultSettings.assist
    if(elements.assist){
      elements.assist.checked = state.assist
    }
    state.mode = savedAdultSettings.mode || state.mode
    savedAdultSettings = null
  } else {
    setDifficulty('norm')
    setAnswerBase('dec')
    state.noTimer = false
    if(elements.noTimer){
      elements.noTimer.checked = false
    }
    state.assist = false
    if(elements.assist){
      elements.assist.checked = false
    }
  }
  updateAssistLabel()
  setKidMessage('')
  saveState()
  updateStatus()
  startRound()
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
  const input = event.target
  const file = input.files?.[0]
  if(!file){
    if(input) input.value = ''
    return
  }
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
  reader.onerror = () => {
    alert('Could not read that file. Please try again.')
  }
  reader.onloadend = () => {
    if(input) input.value = ''
  }
  reader.readAsText(file)
}

function clampNumber(value, min, max){
  if(Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}
