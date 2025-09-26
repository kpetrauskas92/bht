export function drawLineChart(canvas, data, options = {}){
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  ctx.clearRect(0,0,width,height)
  ctx.save()
  const { color = '#6ee7ff', min = Math.min(...data, 0), max = Math.max(...data, 10), gridColor = 'rgba(110,131,255,0.25)', formatter } = options
  const padding = 24
  ctx.fillStyle = 'rgba(255,255,255,0.02)'
  ctx.fillRect(0,0,width,height)
  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1
  const steps = 4
  for(let i=0;i<=steps;i++){
    const y = padding + (height - padding*2) * (i/steps)
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(width - padding, y)
    ctx.stroke()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if(data.length){
    ctx.beginPath()
    data.forEach((value, idx) => {
      const x = padding + (width - padding*2) * (idx/(Math.max(data.length-1,1)))
      const norm = max === min ? 0.5 : (value - min) / (max - min)
      const y = height - padding - (height - padding*2) * norm
      if(idx===0) ctx.moveTo(x,y)
      else ctx.lineTo(x,y)
    })
    ctx.stroke()
  }
  if(options.markers){
    ctx.fillStyle = color
    data.forEach((value, idx) => {
      const x = padding + (width - padding*2) * (idx/(Math.max(data.length-1,1)))
      const norm = max === min ? 0.5 : (value - min) / (max - min)
      const y = height - padding - (height - padding*2) * norm
      ctx.beginPath()
      ctx.arc(x,y,3,0,Math.PI*2)
      ctx.fill()
    })
  }
  if(options.labels){
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.font = '11px ui-sans-serif, system-ui'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    options.labels.forEach((value, idx) => {
      const y = padding + (height - padding*2) * (idx/steps)
      ctx.fillText(value, width - 6, y)
    })
  }
  if(formatter){
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px ui-sans-serif, system-ui'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(formatter(min), padding, height - padding + 6)
    ctx.textAlign = 'right'
    ctx.fillText(formatter(max), width - padding, padding - 14)
  }
  ctx.restore()
}