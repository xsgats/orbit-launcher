import { useEffect, useRef, useState } from 'react'
import type { SkinVariant } from '@shared/types'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Front-facing source rectangles in the 64x64 skin texture. */
function layout(variant: SkinVariant, legacy: boolean): { part: Rect; overlay: Rect | null; at: Rect }[] {
  const armWidth = variant === 'SLIM' ? 3 : 4

  const head: Rect = { x: 8, y: 8, w: 8, h: 8 }
  const headOverlay: Rect = { x: 40, y: 8, w: 8, h: 8 }
  const body: Rect = { x: 20, y: 20, w: 8, h: 12 }
  const bodyOverlay: Rect = { x: 20, y: 36, w: 8, h: 12 }
  const rightArm: Rect = { x: 44, y: 20, w: armWidth, h: 12 }
  const rightArmOverlay: Rect = { x: 44, y: 36, w: armWidth, h: 12 }
  const rightLeg: Rect = { x: 4, y: 20, w: 4, h: 12 }
  const rightLegOverlay: Rect = { x: 4, y: 36, w: 4, h: 12 }

  // The 64x32 format has no dedicated left limbs; they mirror the right ones.
  const leftArm: Rect = legacy ? rightArm : { x: 36, y: 52, w: armWidth, h: 12 }
  const leftArmOverlay: Rect | null = legacy ? null : { x: 52, y: 52, w: armWidth, h: 12 }
  const leftLeg: Rect = legacy ? rightLeg : { x: 20, y: 52, w: 4, h: 12 }
  const leftLegOverlay: Rect | null = legacy ? null : { x: 4, y: 52, w: 4, h: 12 }

  /*
   * Destination grid is 16 wide x 32 tall:
   *   x 0..4   left arm (right edge fixed at the body, so slim arms inset)
   *   x 4..12  head, body, and the two 4-wide legs
   *   x 12..16 right arm
   */
  return [
    { part: head, overlay: headOverlay, at: { x: 4, y: 0, w: 8, h: 8 } },
    { part: body, overlay: bodyOverlay, at: { x: 4, y: 8, w: 8, h: 12 } },
    { part: leftArm, overlay: leftArmOverlay, at: { x: 4 - armWidth, y: 8, w: armWidth, h: 12 } },
    { part: rightArm, overlay: rightArmOverlay, at: { x: 12, y: 8, w: armWidth, h: 12 } },
    { part: leftLeg, overlay: leftLegOverlay, at: { x: 4, y: 20, w: 4, h: 12 } },
    { part: rightLeg, overlay: rightLegOverlay, at: { x: 8, y: 20, w: 4, h: 12 } }
  ]
}

/**
 * Draws a front-facing character from a raw skin texture. Avoids pulling in a
 * 3D renderer while still previewing local files that are not yet uploaded.
 */
export function SkinPreview({
  src,
  variant = 'CLASSIC',
  scale = 8,
  className = ''
}: {
  src: string | null
  variant?: SkinVariant
  scale?: number
  className?: string
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const target = canvas.current
    if (!target) return

    const context = target.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, target.width, target.height)
    setFailed(false)
    if (!src) return

    // No crossOrigin: the canvas is only ever drawn to, never read back, and
    // requesting CORS would make textures fail outright on hosts that omit it.
    const image = new Image()

    image.onload = () => {
      const legacy = image.height === 32
      context.imageSmoothingEnabled = false
      context.clearRect(0, 0, target.width, target.height)

      for (const { part, overlay, at } of layout(variant, legacy)) {
        context.drawImage(image, part.x, part.y, part.w, part.h, at.x * scale, at.y * scale, at.w * scale, at.h * scale)
        if (overlay) {
          context.drawImage(
            image,
            overlay.x,
            overlay.y,
            overlay.w,
            overlay.h,
            at.x * scale,
            at.y * scale,
            at.w * scale,
            at.h * scale
          )
        }
      }
    }

    image.onerror = () => setFailed(true)
    image.src = src

    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [src, variant, scale])

  return (
    <div className={`skin-preview ${className}`} data-empty={!src || failed || undefined}>
      <canvas ref={canvas} width={16 * scale} height={32 * scale} style={{ imageRendering: 'pixelated' }} />
      {(!src || failed) && <span className="skin-preview__empty">No skin</span>}
    </div>
  )
}

/**
 * Cape textures are 64x32 with the visible outer face at (1,1) 10x16.
 * Cropping that with CSS object-position is fiddly and scale-dependent, so draw
 * it the same way the skin is drawn.
 */
export function CapePreview({ src, scale = 3 }: { src: string; scale?: number }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const target = canvas.current
    if (!target) return
    const context = target.getContext('2d')
    if (!context) return

    const image = new Image()
    image.onload = () => {
      // Older capes ship at 64x32; newer ones are larger but keep the ratio.
      const unit = image.width / 64
      context.imageSmoothingEnabled = false
      context.clearRect(0, 0, target.width, target.height)
      context.drawImage(
        image,
        1 * unit,
        1 * unit,
        10 * unit,
        16 * unit,
        0,
        0,
        10 * scale,
        16 * scale
      )
    }
    image.src = src
  }, [src, scale])

  return (
    <canvas
      ref={canvas}
      width={10 * scale}
      height={16 * scale}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  )
}

/** Just the head, for compact lists. */
export function SkinHead({
  src,
  size = 40
}: {
  src: string | null
  size?: number
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const target = canvas.current
    if (!target || !src) return
    const context = target.getContext('2d')
    if (!context) return

    // No crossOrigin: the canvas is only ever drawn to, never read back, and
    // requesting CORS would make textures fail outright on hosts that omit it.
    const image = new Image()
    image.onload = () => {
      context.imageSmoothingEnabled = false
      context.clearRect(0, 0, size, size)
      context.drawImage(image, 8, 8, 8, 8, 0, 0, size, size)
      context.drawImage(image, 40, 8, 8, 8, 0, 0, size, size)
    }
    image.src = src
  }, [src, size])

  return <canvas ref={canvas} width={size} height={size} className="avatar" style={{ imageRendering: 'pixelated' }} />
}
