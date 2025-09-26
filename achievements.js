import { saveState, state } from './state.js'

const ACH_DEFS = [
  {
    key:'speedy',
    label:'Speedster',
    desc:'Answer under 5 seconds',
    checker:({ ok, ms }) => ok && ms < 5000,
  },
  {
    key:'streak10',
    label:'On Fire',
    desc:'10 correct in a row',
    checker:() => state.streak >= 10,
  },
  {
    key:'perfectRound',
    label:'Flawless',
    desc:'Finish a round with 0 mistakes',
    checker:({ roundDone }) => roundDone && state.wrong === 0 && state.solved >= 5,
  },
]

export function evaluateAchievements(payload){
  let updated = false
  for(const def of ACH_DEFS){
    if(state.achievements[def.key]) continue
    if(def.checker(payload || {})){
      state.achievements[def.key] = true
      updated = true
    }
  }
  if(updated) saveState()
  return updated
}

export function roundComplete(){
  return evaluateAchievements({ roundDone:true })
}

export function unlockedAchievements(){
  return ACH_DEFS.filter(def => state.achievements[def.key])
}

export function achievementSummaries(){
  return ACH_DEFS.map(def => ({
    key:def.key,
    label:def.label,
    desc:def.desc,
    unlocked: !!state.achievements[def.key]
  }))
}