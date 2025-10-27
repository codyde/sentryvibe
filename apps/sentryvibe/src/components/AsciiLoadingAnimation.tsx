"use client"

import { useState, useEffect, useRef } from "react"

// Configuration - using existing sentryglyph.png instead of sentry.png
const IMAGE_PATH = '/sentryglyph.png'
const ASCII_CHARS = '@%#*+=-:. '
const SETTINGS = {
  animated: true,
  animationStyle: "line-by-line-vertical",
  animationSpeed: 2,
  grayscale: true,
}

type ColoredChar = {
  char: string
  color: string
}


export default function AsciiLoadingAnimation() {
  const [coloredAsciiArt, setColoredAsciiArt] = useState<ColoredChar[][]>([])
  const settings = SETTINGS
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const [matrixPhase, setMatrixPhase] = useState<"cascade-in" | "hold" | "cascade-out">("cascade-in")
  const [matrixProgress, setMatrixProgress] = useState(0)

  useEffect(() => {
    // Load sentryglyph.png and convert to ASCII
    const img = new Image()
    img.src = IMAGE_PATH

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const resolution = 0.3
      const width = Math.floor(img.width * resolution)
      const height = Math.floor(img.height * resolution)

      canvas.width = img.width
      canvas.height = img.height

      ctx.drawImage(img, 0, 0, img.width, img.height)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      const pixels = imageData.data

      const fontAspect = 0.5
      const widthStep = Math.ceil(img.width / width)
      const heightStep = Math.ceil(img.height / height / fontAspect)

      const asciiArray: ColoredChar[][] = []

      for (let y = 0; y < img.height; y += heightStep) {
        const row: ColoredChar[] = []
        for (let x = 0; x < img.width; x += widthStep) {
          const index = (y * img.width + x) * 4
          const r = pixels[index]
          const g = pixels[index + 1]
          const b = pixels[index + 2]
          const a = pixels[index + 3]

          let char = ' '
          if (a > 128) {
            const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255
            const invertedBrightness = 1 - brightness
            const charIndex = Math.floor(invertedBrightness * (ASCII_CHARS.length - 1))
            char = ASCII_CHARS[charIndex]
          }

          const color = `rgb(${r}, ${g}, ${b})`
          row.push({ char, color })
        }
        asciiArray.push(row)
      }

      setColoredAsciiArt(asciiArray)
    }

    img.onerror = () => {
      console.error('Failed to load image for ASCII animation:', IMAGE_PATH)
      // Fallback: Create a simple "SENTRY" ASCII text pattern
      const fallbackAscii: ColoredChar[][] = [
        [{ char: ' ', color: 'white' }, { char: 'S', color: 'white' }, { char: 'E', color: 'white' }, { char: 'N', color: 'white' }, { char: 'T', color: 'white' }, { char: 'R', color: 'white' }, { char: 'Y', color: 'white' }, { char: ' ', color: 'white' }],
        [{ char: ' ', color: 'white' }, { char: '.', color: 'white' }, { char: '.', color: 'white' }, { char: '.', color: 'white' }, { char: ' ', color: 'white' }, { char: ' ', color: 'white' }, { char: ' ', color: 'white' }, { char: ' ', color: 'white' }],
      ]
      setColoredAsciiArt(fallbackAscii)
    }
  }, [])

  useEffect(() => {
    if (coloredAsciiArt.length > 0) {
      renderToCanvas()
    }
  }, [coloredAsciiArt, settings.grayscale])

  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = undefined
    }

    if (!settings.animated || settings.animationStyle !== "matrix") {
      setMatrixPhase("cascade-in")
      setMatrixProgress(0)
    }
  }, [settings.animated, settings.animationStyle])

  useEffect(() => {
    if (!settings.animated || settings.animationStyle !== "matrix" || coloredAsciiArt.length === 0) {
      return
    }

    const cycleDuration = settings.animationSpeed * 1000
    const cascadeInDuration = cycleDuration * 0.4
    const holdDuration = cycleDuration * 0.2
    const cascadeOutDuration = cycleDuration * 0.4

    let startTime = Date.now()
    let currentPhase: "cascade-in" | "hold" | "cascade-out" = "cascade-in"

    const animate = () => {
      const elapsed = Date.now() - startTime

      if (currentPhase === "cascade-in") {
        const progress = Math.min(elapsed / cascadeInDuration, 1)
        setMatrixProgress(progress)
        setMatrixPhase("cascade-in")

        if (progress >= 1) {
          currentPhase = "hold"
          startTime = Date.now()
        }
      } else if (currentPhase === "hold") {
        setMatrixPhase("hold")

        if (elapsed >= holdDuration) {
          currentPhase = "cascade-out"
          startTime = Date.now()
        }
      } else if (currentPhase === "cascade-out") {
        const progress = Math.min(elapsed / cascadeOutDuration, 1)
        setMatrixProgress(progress)
        setMatrixPhase("cascade-out")

        if (progress >= 1) {
          currentPhase = "cascade-in"
          startTime = Date.now()
          setMatrixProgress(0)
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [settings.animated, settings.animationStyle, coloredAsciiArt, settings.animationSpeed])

  const renderToCanvas = () => {
    if (!outputCanvasRef.current || coloredAsciiArt.length === 0) return

    const canvas = outputCanvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const fontSize = 8
    ctx.font = `${fontSize}px monospace`
    ctx.textBaseline = "top"

    const lineHeight = fontSize
    const charWidth = fontSize * 0.6

    canvas.width = coloredAsciiArt[0].length * charWidth
    canvas.height = coloredAsciiArt.length * lineHeight

    ctx.font = `${fontSize}px monospace`
    ctx.textBaseline = "top"

    coloredAsciiArt.forEach((row, rowIndex) => {
      row.forEach((col, colIndex) => {
        ctx.fillStyle = settings.grayscale ? "white" : col.color
        ctx.fillText(col.char, colIndex * charWidth, rowIndex * lineHeight)
      })
    })
  }

  if (coloredAsciiArt.length === 0) {
    return null
  }

  return (
    <div className="w-full flex items-center justify-center">
      <style jsx>{`
        @keyframes lineByLineVertical {
          0% {
            clip-path: inset(100% 0 0 0);
          }
          45% {
            clip-path: inset(0 0 0 0);
          }
          55% {
            clip-path: inset(0 0 0 0);
          }
          100% {
            clip-path: inset(0 0 100% 0);
          }
        }

        @keyframes lineByLineHorizontal {
          0% {
            clip-path: inset(0 100% 0 0);
          }
          45% {
            clip-path: inset(0 0 0 0);
          }
          55% {
            clip-path: inset(0 0 0 0);
          }
          100% {
            clip-path: inset(0 0 0 100%);
          }
        }

        .animate-line-by-line-vertical {
          animation: lineByLineVertical calc(var(--animation-duration) * 1s) ease-in-out infinite;
        }

        .animate-line-by-line-horizontal {
          animation: lineByLineHorizontal calc(var(--animation-duration) * 1s) ease-in-out infinite;
        }
      `}</style>

      <div
        className={settings.animated && settings.animationStyle === "matrix" ? "matrix-container" : ""}
        style={{
          // @ts-ignore
          "--animation-duration": `${settings.animationSpeed}`,
        }}
      >
        {settings.animated && settings.animationStyle === "matrix" ? (
          <MatrixCanvas
            coloredAsciiArt={coloredAsciiArt}
            grayscale={settings.grayscale}
            phase={matrixPhase}
            progress={matrixProgress}
          />
        ) : (
          <canvas
            ref={outputCanvasRef}
            className={`max-w-full select-text ${
              settings.animated && settings.animationStyle === "line-by-line-vertical"
                ? "animate-line-by-line-vertical"
                : settings.animated && settings.animationStyle === "line-by-line-horizontal"
                  ? "animate-line-by-line-horizontal"
                  : ""
            }`}
            style={{
              fontSize: "0.4rem",
              lineHeight: "0.4rem",
              fontFamily: "monospace",
              // @ts-ignore
              "--animation-duration": `${settings.animationSpeed}`,
            }}
          />
        )}
      </div>
    </div>
  )
}

function MatrixCanvas({
  coloredAsciiArt,
  grayscale,
  phase,
  progress,
}: {
  coloredAsciiArt: { char: string; color: string }[][]
  grayscale: boolean
  phase: "cascade-in" | "hold" | "cascade-out"
  progress: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const columnOffsetsRef = useRef<number[]>([])

  useEffect(() => {
    if (coloredAsciiArt.length > 0 && columnOffsetsRef.current.length === 0) {
      const numColumns = coloredAsciiArt[0]?.length || 0
      columnOffsetsRef.current = Array.from({ length: numColumns }, () => Math.random())
    }
  }, [coloredAsciiArt])

  useEffect(() => {
    if (!canvasRef.current || coloredAsciiArt.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const fontSize = 8
    const lineHeight = fontSize
    const charWidth = fontSize * 0.6
    const totalRows = coloredAsciiArt.length
    const totalCols = coloredAsciiArt[0].length

    canvas.width = totalCols * charWidth
    canvas.height = totalRows * lineHeight

    ctx.font = `${fontSize}px monospace`
    ctx.textBaseline = "top"
    ctx.fillStyle = "black"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let colIndex = 0; colIndex < totalCols; colIndex++) {
      const columnOffset = columnOffsetsRef.current[colIndex] || 0

      for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
        const char = coloredAsciiArt[rowIndex][colIndex]
        if (!char) continue

        let shouldDraw = false
        let opacity = 1

        if (phase === "cascade-in") {
          const adjustedProgress = progress + columnOffset * 0.3
          const rowProgress = rowIndex / totalRows

          if (adjustedProgress >= rowProgress) {
            shouldDraw = true
            const trailLength = 0.1
            const distanceFromHead = adjustedProgress - rowProgress
            if (distanceFromHead < trailLength) {
              opacity = 0.3 + (distanceFromHead / trailLength) * 0.7
            }
          }
        } else if (phase === "hold") {
          shouldDraw = true
          opacity = 1
        } else if (phase === "cascade-out") {
          const adjustedProgress = progress + columnOffset * 0.3
          const rowProgress = (totalRows - rowIndex - 1) / totalRows

          if (adjustedProgress < rowProgress) {
            shouldDraw = true
            const trailLength = 0.1
            const distanceFromHead = rowProgress - adjustedProgress
            if (distanceFromHead < trailLength) {
              opacity = 0.3 + (distanceFromHead / trailLength) * 0.7
            }
          }
        }

        if (shouldDraw) {
          if (grayscale) {
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
          } else {
            const color = char.color
            const rgb = color.match(/\d+/g)
            if (rgb) {
              ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`
            }
          }

          ctx.fillText(char.char, colIndex * charWidth, rowIndex * lineHeight)
        }
      }
    }
  }, [coloredAsciiArt, grayscale, phase, progress])

  return <canvas ref={canvasRef} className="max-w-full" />
}

