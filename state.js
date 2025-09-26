const STORAGE_KEY = 'bht_state_v1'
const BASE_PER_MODE = ['octet','ipv4','hex','mask','ipv6','subnet','reverse']
const LEVEL_THRESHOLDS = [0, 200, 450, 800, 1200, 1700, 2300]
const UNLOCK_LEVELS = BASE_PER_MODE.reduce((acc, mode) => { acc[mode] = 1; return acc }, {})
const MAX_HISTORY = 100

const defaultModeStats = () => ({ best:null, acc:0, total:0, ok:0, history:[] })

export const state = {
  mode: 'octet',
  answerBase: 'dec',
  currentQuestion: null,
  startAt: 0,
  solved: 0,
  wrong: 0,
  xp: 0,
  best: null,
  streak: 0,
  level: 1,
  timerId: null,
  roundEndAt: 0,
  difficulty: 'norm',
  roundLen: 30,
  noTimer: false,
  assist: false,
  hist: [],
  roundEntries: [],
  achievements: {
    speedy: false,
    streak10: false,
    perfectRound: false,
  },
  perMode: BASE_PER_MODE.reduce((acc, m) => { acc[m] = defaultModeStats(); return acc }, {}),
  xpHistory: [],
  accuracyWindow: [],
  theme: 'dark',
  autoExplain: false,
}

export const constants = {
  STORAGE_KEY,
  LEVEL_THRESHOLDS,
  UNLOCK_LEVELS,
  MODES: BASE_PER_MODE,
  MAX_HISTORY,
}

export function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if(!raw) return
    const data = JSON.parse(raw)
    Object.assign(state, {
      xp: data.xp ?? state.xp,
      best: data.best ?? state.best,
      streak: data.streak ?? state.streak,
      level: data.level ?? state.level,
      difficulty: data.difficulty ?? state.difficulty,
      roundLen: data.roundLen ?? state.roundLen,
      noTimer: data.noTimer ?? state.noTimer,
      assist: data.assist ?? state.assist,
      achievements: Object.assign({}, state.achievements, data.achievements || {}),
      perMode: mergePerMode(data.perMode || {}),
      xpHistory: data.xpHistory || [],
      hist: data.hist || [],
      theme: data.theme || 'dark',
      autoExplain: data.autoExplain || false,
    })
  } catch (err) {
    console.warn('Failed to load state', err)
  }
}

function mergePerMode(saved){
  const next = {}
  for(const mode of BASE_PER_MODE){
    const base = defaultModeStats()
    next[mode] = Object.assign(base, saved[mode] || {})
    if(!Array.isArray(next[mode].history)) next[mode].history = []
  }
  return next
}

export function saveState(){
  const data = {
    xp: state.xp,
    best: state.best,
    streak: state.streak,
    level: state.level,
    difficulty: state.difficulty,
    roundLen: state.roundLen,
    noTimer: state.noTimer,
    assist: state.assist,
    achievements: state.achievements,
    perMode: state.perMode,
    xpHistory: state.xpHistory.slice(-MAX_HISTORY),
    hist: state.hist.slice(-MAX_HISTORY),
    theme: state.theme,
    autoExplain: state.autoExplain,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('Failed to save state', err)
  }
}

export function exportState(){
  return JSON.stringify({
    version: 3,
    savedAt: Date.now(),
    data: {
      xp: state.xp,
      best: state.best,
      streak: state.streak,
      level: state.level,
      difficulty: state.difficulty,
      roundLen: state.roundLen,
      noTimer: state.noTimer,
      assist: state.assist,
      achievements: state.achievements,
      perMode: state.perMode,
      xpHistory: state.xpHistory,
      hist: state.hist,
      theme: state.theme,
      autoExplain: state.autoExplain,
    }
  }, null, 2)
}

export function importState(json){
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error('Invalid JSON file')
  }
  const payload = parsed?.data || parsed
  if(typeof payload !== 'object') throw new Error('Missing data block')
  Object.assign(state, {
    xp: payload.xp ?? state.xp,
    best: payload.best ?? state.best,
    streak: payload.streak ?? state.streak,
    level: payload.level ?? state.level,
    difficulty: payload.difficulty ?? state.difficulty,
    roundLen: payload.roundLen ?? state.roundLen,
    noTimer: payload.noTimer ?? state.noTimer,
    assist: payload.assist ?? state.assist,
    achievements: Object.assign({}, state.achievements, payload.achievements || {}),
    perMode: mergePerMode(payload.perMode || {}),
    xpHistory: Array.isArray(payload.xpHistory) ? payload.xpHistory.slice(-MAX_HISTORY) : state.xpHistory,
    hist: Array.isArray(payload.hist) ? payload.hist.slice(-MAX_HISTORY) : state.hist,
    theme: payload.theme || state.theme,
    autoExplain: payload.autoExplain ?? state.autoExplain,
  })
  saveState()
}

export function recordResult({ mode, ok, ms, difficulty }){
  const entry = { mode, ok, ms, difficulty, ts: Date.now() }
  state.hist.push(entry)
  if(state.hist.length > MAX_HISTORY) state.hist.shift()
  state.roundEntries.push(entry)

  const stats = state.perMode[mode] || defaultModeStats()
  stats.total += 1
  if(ok){
    stats.ok += 1
    if(!stats.best || ms < stats.best) stats.best = ms
  }
  stats.acc = stats.total ? (stats.ok / stats.total) : 0
  stats.history.push(entry)
  if(stats.history.length > MAX_HISTORY) stats.history.shift()
  state.perMode[mode] = stats

  if(ok){
    state.solved += 1
    state.streak += 1
  } else {
    state.wrong += 1
    state.streak = 0
  }
  state.accuracyWindow.push(ok)
  if(state.accuracyWindow.length > 20) state.accuracyWindow.shift()

  if(!state.best || (ok && ms < state.best)) state.best = ok ? ms : state.best
}

export function resetRound(){
  state.solved = 0
  state.wrong = 0
  state.roundEntries = []
  state.accuracyWindow = []
}

export function awardXp(amount){
  state.xp += amount
  state.xpHistory.push({ xp: state.xp, level: state.level, ts: Date.now() })
  if(state.xpHistory.length > MAX_HISTORY) state.xpHistory.shift()
  const newLevel = computeLevel(state.xp)
  if(newLevel !== state.level){
    state.level = newLevel
  }
}

function computeLevel(xp){
  let level = LEVEL_THRESHOLDS.length
  for(let i = 0; i < LEVEL_THRESHOLDS.length; i++){
    if(xp < LEVEL_THRESHOLDS[i]){
      level = i
      break
    }
  }
  return Math.max(1, level)
}

export function isModeUnlocked(){
  return true
}

export function modesForLevel(){
  return BASE_PER_MODE.slice()
}

export function currentRoundAccuracy(){
  const total = state.solved + state.wrong
  if(!total) return 0
  return state.solved / total
}

export function streak(){
  return state.streak
}

export function resetProgress(){
  localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}

export function setTheme(theme){
  state.theme = theme
  saveState()
}

export function setAutoExplain(enabled){
  state.autoExplain = enabled
  saveState()
}

export function xpForDifficulty(diff){
  switch(diff){
    case 'easy': return 8
    case 'norm': return 12
    case 'hard': return 18
    case 'expert': return 24
    default: return 10
  }
}

export function roundTimeMultiplier(diff){
  switch(diff){
    case 'easy': return 1.1
    case 'norm': return 1.0
    case 'hard': return 0.85
    case 'expert': return 0.7
    default: return 1.0
  }
}

export function difficultyAllowedModes(diff){
  if(diff === 'easy') return ['octet','reverse']
  if(diff === 'norm') return ['octet','hex','ipv4','reverse']
  if(diff === 'hard') return ['octet','hex','ipv4','mask','reverse']
  return BASE_PER_MODE.slice()
}




