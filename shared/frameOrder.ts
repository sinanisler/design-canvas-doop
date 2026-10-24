import type { Frame } from './types'

/** The frames with the ones named in `order` put into that order, each in the
 *  slot one of them already held, so frames not named keep their place. Every
 *  frame then carries z = its index: the canvas's order is stored as numbers,
 *  and a frame that moved returns as a new object so callers can see what
 *  changed. The caller checks that `order` names exactly the frames it means
 *  to move. */
export function placeFrames(frames: Frame[], order: string[]): Frame[] {
  const byId = new Map(frames.map((f) => [f.id, f]))
  const named = new Set(order)
  const slots = frames.flatMap((f, i) => (named.has(f.id) ? [i] : []))
  const next = [...frames]
  order.forEach((id, k) => {
    const frame = byId.get(id)
    const slot = slots[k]
    if (frame && slot !== undefined) next[slot] = frame
  })
  return next.map((f, z) => (f.z === z ? f : { ...f, z }))
}

/** Back-to-front order by z. A frame without one counts as 0, so callers that
 *  need creation order for those break the tie themselves. */
export function byStackOrder(a: Frame, b: Frame): number {
  return (a.z ?? 0) - (b.z ?? 0)
}
