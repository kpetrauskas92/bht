import { state } from './state.js'

const POWERS = [128,64,32,16,8,4,2,1]

const MODE_GENERATORS = {
  octet: genOctet,
  hex: genHex,
  ipv4: genIPv4,
  mask: genMask,
  ipv6: genIPv6,
  subnet: genSubnet,
  reverse: genReverse,
}

export function generateQuestion(){
  const generator = MODE_GENERATORS[state.mode] || genOctet
  let question = generator(state)
  const forcedBase = question.forcedBase || null
  const validBases = question.validBases || ['dec','bin','hex']
  if(forcedBase && !validBases.includes(forcedBase)) validBases.unshift(forcedBase)
  question.validBases = Array.from(new Set(validBases))
  question.forcedBase = forcedBase
  if(question.validBases.length && !question.validBases.includes(state.answerBase)){
    state.answerBase = question.validBases[0]
  }
  question = addKidHints(question)
  return question
}

export function evaluateAnswer(question, rawInput, base, { bitsFromGrid } = {}){
  const targetBase = question.forcedBase || base
  const normalisedInput = normaliseInput(rawInput, targetBase)
  let finalAnswer = normalisedInput
  if(!finalAnswer && targetBase === 'bin' && bitsFromGrid){
    finalAnswer = bitsFromGrid
  }
  const accepted = question.acceptedAnswers?.[targetBase] || []
  const ok = accepted.some(ans => compareAnswers(ans, finalAnswer, targetBase, question))
  const expected = accepted[0] || ''
  return {
    ok,
    expected,
    provided: finalAnswer,
    baseUsed: targetBase,
  }
}

function compareAnswers(expected, actual, base, question){
  if(question?.comparator) return question.comparator(expected, actual, base)
  if(actual == null) return false
  if(base === 'dec'){
    if(isFiniteNumber(expected) && isFiniteNumber(actual)){
      return Number(expected) === Number(actual)
    }
  }
  if(base === 'bin'){
    return expected === actual
  }
  if(base === 'hex'){
    return expected.toUpperCase() === actual.toUpperCase()
  }
  return String(expected).toLowerCase() === String(actual).toLowerCase()
}

function normaliseInput(value, base){
  if(typeof value !== 'string') value = value == null ? '' : String(value)
  const trimmed = value.trim()
  if(!trimmed) return ''
  if(base === 'dec'){
    return trimmed.replace(/[,\s]/g,'')
  }
  if(base === 'bin'){
    return trimmed.replace(/[^01]/g,'')
  }
  if(base === 'hex'){
    return trimmed.replace(/0x/i,'').replace(/[^0-9a-f]/ig,'').toUpperCase()
  }
  return trimmed
}

function isFiniteNumber(v){
  return !Number.isNaN(Number(v)) && Number.isFinite(Number(v))
}

function genOctet(state){
  const diff = state.difficulty
  let value
  if(diff === 'easy'){
    const pool = [0,1,2,3,4,5,6,7,8,9,10,12,14,16,32,64,128,192,224]
    value = pick(pool)
  } else if(diff === 'hard' || diff === 'expert'){
    value = randInt(16, 255)
  } else {
    value = randInt(0, 255)
  }
  const binary = toBin(value,8)
  const hex = toHex(value,2)
  const base = state.answerBase
  const sourcePool = base === 'dec'
    ? ['bin','hex']
    : base === 'bin'
      ? ['dec','hex']
      : ['dec','bin']
  const source = pick(sourcePool)
  const spacedBinary = diff === 'hard' || diff === 'expert' ? formatBinary(binary,4,' ') : formatBinary(binary,4,' ')
  let prompt = ''
  let task = ''
  if(source === 'bin'){
    prompt = diff === 'expert' ? insertDistractors(spacedBinary) : spacedBinary
    task = `Convert binary to ${baseName(base)}`
  } else if(source === 'hex'){
    prompt = diff === 'expert' ? `0x${hex.toLowerCase()}` : `0x${hex}`
    task = `Convert hex to ${baseName(base)}`
  } else {
    prompt = String(value)
    task = `Convert decimal to ${baseName(base)}`
  }

  const explanation = buildBitExplanation(binary, value)
  const accepted = {
    dec: [String(value)],
    bin: unique([
      binary,
      formatBinary(binary,4,' '),
      formatBinary(binary,8,' '),
    ]),
    hex: unique([hex, hex.toLowerCase(), `0x${hex}`, `0x${hex.toLowerCase()}`])
  }

  return addKidHints({
    id: cryptoId(),
    mode:'octet',
    prompt,
    task,
    source,
    acceptedAnswers: accepted,
    bitGroups: [{ bits: binary, label: 'byte0' }],
    explanation,
    highlight: indicesOf(binary,'1'),
    validBases:['dec','bin','hex'],
    acceptsBits:true,
  }, {
    kidPrompt: source === 'bin' ? `Light pattern: ${prompt}` : `Number magic: ${prompt}`,
    kidTask: `Show it in ${kidBaseName(base)} for Buddy Bear.`,
    kidStory: `Buddy Bear has ${value} treats. Turn on the right lights to count them!`,
  })
}

function genHex(state){
  const diff = state.difficulty
  const width = diff === 'expert' ? 24 : diff === 'hard' ? 16 : 8
  const max = (1 << width) - 1
  const value = randInt(width === 8 ? 0 : 16, max)
  const binary = toBin(value, width)
  const hexDigits = width / 4
  const hex = toHex(value, hexDigits)
  const base = state.answerBase
  const source = base === 'hex' ? 'bin' : 'hex'
  const prompt = source === 'hex' ? `0x${hex}` : formatBinary(binary,4,' ')
  const task = `Convert ${sourceName(source)} to ${baseName(base)}`
  const accepted = {
    dec: [String(value)],
    bin: buildBinaryAccepts(binary),
    hex: unique([hex, hex.toLowerCase(), `0x${hex}`, `0x${hex.toLowerCase()}`])
  }
  const explanation = buildBitExplanation(binary, value)
  const bitGroups = chunkBinary(binary,8).map((bits, idx) => ({ bits, label:`byte${idx}` }))
  return addKidHints({
    id: cryptoId(),
    mode:'hex',
    prompt,
    task,
    acceptedAnswers: accepted,
    bitGroups,
    explanation,
    highlight: indicesOf(binary,'1'),
    validBases:['dec','bin','hex'],
    acceptsBits:true,
  }, {
    kidPrompt: source === 'hex' ? `Magic hex: ${prompt}` : `Light groups: ${prompt}`,
    kidTask: `Change it into ${kidBaseName(base)} for Buddy Bear.`,
    kidStory: 'Group the switches in fours to read the secret hex code.',
  })
}

function genIPv4(state){
  const diff = state.difficulty
  const octets = Array.from({ length:4 }, () => randInt(0,255))
  if(diff === 'hard' || diff === 'expert'){
    octets[0] = randInt(128,255)
    octets[3] = randInt(1,254)
  }
  const dotted = octets.join('.')
  const binary = octets.map(o => toBin(o,8)).join('')
  const groupedBin = octets.map(o => toBin(o,8)).join(diff === 'expert' ? '_' : ' ')
  const hex = octets.map(o => toHex(o,2)).join(diff === 'expert' ? ':' : '')
  const base = state.answerBase
  const source = pick(base === 'dec' ? ['bin','hex'] : base === 'bin' ? ['dec','hex'] : ['dec','bin'])
  let prompt
  if(source === 'bin'){
    prompt = diff === 'expert' ? insertDistractors(groupedBin) : groupedBin
  } else if(source === 'hex'){
    prompt = diff === 'expert' ? `0x${hex.toLowerCase()}` : `0x${hex}`
  } else {
    prompt = dotted
  }
  const task = `Convert ${sourceName(source)} to ${baseName(base)}`
  const accepted = {
    dec: [dotted],
    bin: buildBinaryAccepts(binary, 8, true),
    hex: unique([hex, hex.toLowerCase(), `0x${hex}`, hex.match(/.{2}/g).join(':'), hex.match(/.{2}/g).map(s=>s.toLowerCase()).join(':')])
  }
  const explanation = [`IPv4 ${dotted}`, ...octets.map((o,idx)=>`Octet ${idx+1}: ${toBin(o,8)} = ${o}`)]
  const bitGroups = octets.map((o, idx) => ({ bits: toBin(o,8), label: `Octet ${idx+1}` }))
  return addKidHints({
    id: cryptoId(),
    mode:'ipv4',
    prompt,
    task,
    acceptedAnswers: accepted,
    bitGroups,
    explanation,
    highlight: indicesOf(binary,'1'),
    validBases:['dec','bin','hex'],
    acceptsBits:true,
  }, {
    kidPrompt: source === 'dec' ? `Address: ${prompt}` : `Address puzzle: ${prompt}`,
    kidTask: 'Build the friendly house address.',
    kidStory: 'Each dot is a house on the street. Read each group to find Buddy Bear’s home.',
  })
}

function genMask(state){
  const diff = state.difficulty
  const prefix = diff === 'easy' ? randPick([24,25,26,27,28]) : randInt(8,30)
  const maskBits = '1'.repeat(prefix).padEnd(32,'0')
  const maskOctets = chunkBinary(maskBits,8).map(bin => parseInt(bin,2))
  const dotted = maskOctets.join('.')
  const hex = maskOctets.map(o=>toHex(o,2)).join('')
  const wildcardOctets = maskOctets.map(o=>255-o)
  const wildcard = wildcardOctets.join('.')
  const base = state.answerBase
  const questionType = diff === 'expert' ? pick(['mask','wildcard','hosts']) : pick(['mask','hosts'])
  let prompt = `CIDR /${prefix}`
  let task = ''
  const accepted = {
    dec: [dotted],
    bin: buildBinaryAccepts(maskBits, 8, true),
    hex: unique([hex, hex.toLowerCase(), `0x${hex}`, chunkString(hex,4).join(':')])
  }
  if(questionType === 'hosts'){
    const hosts = prefix >= 31 ? 0 : Math.pow(2, 32-prefix) - 2
    task = `How many usable hosts per /${prefix} network?`
    accepted.dec = [String(hosts)]
    accepted.bin = [toBin(hosts, Math.max(8, Math.ceil(Math.log2(Math.max(hosts,1))+1)))]
    accepted.hex = [toHex(hosts, Math.max(2, Math.ceil((32-prefix)/4)))]
  } else if(questionType === 'wildcard'){
    task = `Provide the wildcard mask for /${prefix}`
    accepted.dec = [wildcard]
  } else {
    task = `Convert CIDR /${prefix} to ${baseName(base)}`
  }
  const explanation = [
    `/${prefix} => ${'1'.repeat(prefix)}${'0'.repeat(32-prefix)}`,
    `Mask dotted decimal: ${dotted}`,
    `Wildcard: ${wildcard}`,
  ]
  const bitGroups = chunkBinary(maskBits,8).map((bits, idx) => ({ bits, label: `Octet ${idx+1}` }))
  let validBases = ['dec','bin','hex']
  if(questionType === 'hosts') validBases = ['dec']
  return addKidHints({
    id: cryptoId(),
    mode:'mask',
    prompt,
    task,
    acceptedAnswers: accepted,
    bitGroups,
    explanation,
    highlight: indicesOf(maskBits,'1'),
    validBases,
    acceptsBits:true,
    forcedBase: questionType === 'hosts' ? 'dec' : null,
  }, {
    kidPrompt: `Mask puzzle: ${prompt}`,
    kidTask: questionType === 'hosts' ? 'How many friends fit on each street?' : 'Show Buddy Bear the mask number.',
    kidStory: questionType === 'hosts'
      ? `Cover the last ${32-prefix} spots and count the free ones for friends.`
      : 'A mask keeps certain lights on. Count how many stay shiny.',
  })
}

function genIPv6(state){
  const diff = state.difficulty
  const groups = diff === 'expert' ? 4 : 2
  const hextets = Array.from({ length: groups }, () => toHex(randInt(0,65535), 4))
  const promptHex = hextets.join(':')
  const binary = hextets.map(h => toBin(parseInt(h,16),16)).join('')
  const base = state.answerBase
  const validBases = ['hex','bin']
  const prompt = base === 'hex' ? formatBinary(binary,4,' ') : promptHex
  const task = base === 'hex' ? 'Convert binary to hexadecimal (IPv6 hextets)' : 'Convert IPv6 hextets to binary'
  const accepted = {
    hex: unique([promptHex, promptHex.toLowerCase(), promptHex.replace(/:/g,'')]),
    bin: buildBinaryAccepts(binary, 4, true)
  }
  const bitGroups = chunkBinary(binary,16).map((bits, idx) => ({ bits, label: `Hextet ${idx+1}` }))
  const explanation = hextets.map((h, idx)=>`Hextet ${idx+1}: ${h} = ${toBin(parseInt(h,16),16)}`)
  return addKidHints({
    id: cryptoId(),
    mode:'ipv6',
    prompt,
    task,
    acceptedAnswers: accepted,
    bitGroups,
    explanation,
    highlight: indicesOf(binary,'1'),
    validBases,
    acceptsBits:true,
    forcedBase: validBases.includes(state.answerBase) ? null : 'hex',
  }, {
    kidPrompt: base === 'hex' ? `Giant lights: ${prompt}` : `Magic address: ${prompt}`,
    kidTask: 'Turn the big address into friendly pieces.',
    kidStory: 'Break the huge address into smaller chunks so Buddy Bear can read it.',
  })
}

function genSubnet(state){
  const diff = state.difficulty
  const baseTypes = diff === 'expert' ? ['hosts','subnets','wildcard'] : ['hosts','subnets']
  const typePool = state.kidMode ? baseTypes.filter(t => t !== 'wildcard') : baseTypes
  const type = pick(typePool)
  if(type === 'hosts'){
    const prefix = randInt(8,30)
    const hosts = prefix >= 31 ? 0 : Math.pow(2, 32-prefix) - 2
    return addKidHints({
      id: cryptoId(),
      mode:'subnet',
      prompt: `/${prefix} network`,
      task: 'Usable hosts per subnet?',
      acceptedAnswers: { dec: [String(hosts)] },
      bitGroups: [],
      explanation:[`Hosts = 2^(32-${prefix}) - 2 = ${hosts}`],
      validBases:['dec'],
      forcedBase:'dec',
      acceptsBits:false,
    }, {
      kidPrompt: `Playground /${prefix}`,
      kidTask: 'How many friends can play on one street?',
      kidStory: hosts > 0
        ? `We cut the big yard into /${prefix} streets. Each street fits ${hosts} friends!`
        : `A /${prefix} street is too tiny for friends, so no extra houses here.`,
    })
  }
  if(type === 'subnets'){
    const basePrefix = randInt(8,24)
    const newPrefix = randInt(basePrefix+1, Math.min(30, basePrefix+6))
    const subnets = Math.pow(2, newPrefix - basePrefix)
    return addKidHints({
      id: cryptoId(),
      mode:'subnet',
      prompt: `${basePrefix} -> ${newPrefix}`,
      task: 'How many subnets?',
      acceptedAnswers: { dec: [String(subnets)] },
      bitGroups: [],
      explanation:[`Subnets = 2^(${newPrefix}-${basePrefix}) = ${subnets}`],
      validBases:['dec'],
      forcedBase:'dec',
      acceptsBits:false,
    }, {
      kidPrompt: `Split /${basePrefix} into /${newPrefix}`,
      kidTask: 'How many tiny streets did we make?',
      kidStory: `We chopped a /${basePrefix} town into /${newPrefix} streets. Count the ${subnets} new playgrounds!`,
    })
  }
  // wildcard type
  const prefix = randInt(8,30)
  const maskBits = '1'.repeat(prefix).padEnd(32,'0')
  const maskOctets = chunkBinary(maskBits,8).map(b=>parseInt(b,2))
  const wildcardOctets = maskOctets.map(o=>255-o)
  const wildcard = wildcardOctets.join('.')
  return addKidHints({
    id: cryptoId(),
    mode:'subnet',
    prompt: `/${prefix} network`,
    task: 'Wildcard mask?',
    acceptedAnswers: { dec:[wildcard] },
    bitGroups: [],
    explanation:[`Wildcard = 255 - mask = ${wildcard}`],
    validBases:['dec'],
    forcedBase:'dec',
    acceptsBits:false,
  }, {
    kidPrompt: `Wildcard for /${prefix}`,
    kidTask: 'Find the leftover numbers.',
    kidStory: 'Take 255 from each mask piece to find the playful wildcard.',
  })
}

function genReverse(state){
  const baseValue = state.difficulty === 'easy' ? randInt(0,127) : state.difficulty === 'hard' || state.difficulty === 'expert' ? randInt(64,255) : randInt(0,255)
  const binary = toBin(baseValue,8)
  const prompt = `${baseValue}`
  const task = 'Enter the binary representation (or flip the bits)'
  const accepted = {
    bin: buildBinaryAccepts(binary),
    dec: [String(baseValue)],
    hex: [toHex(baseValue,2)]
  }
  const explanation = buildBitExplanation(binary, baseValue)
  return addKidHints({
    id: cryptoId(),
    mode:'reverse',
    prompt,
    task,
    acceptedAnswers: accepted,
    bitGroups: [{ bits: binary, label:'byte0' }],
    explanation,
    highlight: indicesOf(binary,'1'),
    validBases:['bin'],
    forcedBase:'bin',
    acceptsBits:true,
  }, {
    kidPrompt: `Number: ${prompt}`,
    kidTask: 'Flip the switches to match the number.',
    kidStory: 'Turn the lights on or off until they show the magic number.',
  })
}

function baseName(base){
  if(base === 'dec') return 'decimal'
  if(base === 'bin') return 'binary'
  if(base === 'hex') return 'hexadecimal'
  return base
}
function sourceName(src){
  if(src === 'hex') return 'hex'
  if(src === 'bin') return 'binary'
  return 'decimal'
}

function addKidHints(question, overrides = {}){
  if(!question) return question
  const defaults = defaultKidHints(question)
  question.kidPrompt = overrides.kidPrompt ?? defaults.kidPrompt
  question.kidTask = overrides.kidTask ?? defaults.kidTask
  question.kidStory = overrides.kidStory ?? defaults.kidStory
  return question
}

function defaultKidHints(question){
  const prompt = question.prompt
  const task = question.task || 'Let’s solve the puzzle!'
  switch(question.mode){
    case 'octet':
      return {
        kidPrompt: `Shiny switches: ${prompt}`,
        kidTask: 'How many treats do the lights show?',
        kidStory: 'Add the numbers under the glowing 1s to count the treats.',
      }
    case 'hex':
      return {
        kidPrompt: `Magic code: ${prompt}`,
        kidTask: 'Turn the magic code into a friendly number.',
        kidStory: 'Group the switches in fours to read the hex magic.',
      }
    case 'ipv4':
      return {
        kidPrompt: `Address puzzle: ${prompt}`,
        kidTask: 'Build the friendly house address.',
        kidStory: 'Each dot is a house. Read every group to find Buddy Bear’s home.',
      }
    case 'mask':
      return {
        kidPrompt: `Mask puzzle: ${prompt}`,
        kidTask: task,
        kidStory: 'A mask keeps special lights on. Count how many stay shiny.',
      }
    case 'ipv6':
      return {
        kidPrompt: `Magic address: ${prompt}`,
        kidTask: task,
        kidStory: 'Break the huge address into smaller chunks so Buddy Bear can read it.',
      }
    case 'subnet':
      return {
        kidPrompt: `Subnet fun: ${prompt}`,
        kidTask: task,
        kidStory: 'Share the big playground into little streets for friends.',
      }
    case 'reverse':
      return {
        kidPrompt: `Number: ${prompt}`,
        kidTask: task,
        kidStory: 'Flip the switches until they match the number.',
      }
    default:
      return {
        kidPrompt: `Puzzle: ${prompt}`,
        kidTask: task,
        kidStory: 'Buddy Bear is here to help you count!',
      }
  }
}

function kidBaseName(base){
  if(base === 'dec') return 'numbers'
  if(base === 'bin') return 'light pattern'
  if(base === 'hex') return 'hex magic'
  return base
}

function toBin(value, width){
  return value.toString(2).padStart(width,'0')
}
function toHex(value, width){
  return value.toString(16).toUpperCase().padStart(width,'0')
}
function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick(arr){
  return arr[Math.floor(Math.random()*arr.length)]
}
const randPick = pick
function unique(list){
  return Array.from(new Set(list.filter(Boolean)))
}
function formatBinary(bin, group=4, sep=' '){
  if(!group) return bin
  return chunkString(bin, group).join(sep)
}
function chunkBinary(bin, size){
  const out = []
  for(let i=0;i<bin.length;i+=size) out.push(bin.slice(i,i+size))
  return out
}
function chunkString(str, size){
  const res = []
  for(let i=0;i<str.length;i+=size) res.push(str.slice(i,i+size))
  return res
}
function indicesOf(str, match){
  const list = []
  for(let i=0;i<str.length;i++) if(str[i]===match) list.push(i)
  return list
}
function buildBitExplanation(binary, value){
  const bits = binary.split('')
  const steps = []
  let total = 0
  bits.forEach((bit, idx) => {
    if(bit === '1'){
      const pow = POWERS[idx] || Math.pow(2, bits.length - idx - 1)
      total += pow
      steps.push(`Bit ${idx} (value ${pow}) contributes ${pow}`)
    }
  })
  steps.push(`Total = ${total}`)
  return steps
}
function buildBinaryAccepts(bin, groupSize=4, dotted=false){
  const base = bin
  const groups = []
  if(groupSize){
    groups.push(chunkString(bin, groupSize).join(' '))
    groups.push(chunkString(bin, groupSize).join(''))
  }
  if(dotted){
    groups.push(chunkString(bin,8).join('.'))
    groups.push(chunkString(bin,8).join(' '))
  }
  return unique([base, ...groups])
}
function insertDistractors(str){
  return str.replace(/\s/g, () => pick([' ', '  ', '\u2009']))
}
function cryptoId(){
  if(window.crypto?.randomUUID) return window.crypto.randomUUID()
  return Math.random().toString(36).slice(2,10)
}





