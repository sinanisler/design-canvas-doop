import type { Frame } from '../../shared/types'
import { useStore } from './store'
import { api } from './api'
import { deleteFramesTracked, recordUpdate, recordUpdates } from './history'
import {
  INSERTABLE,
  duplicateElement,
  groupElements,
  insertElement,
  isLocked,
  moveElement,
  moveElementAcross,
  placeImage,
  removeElements,
  replaceElement,
  setHidden,
  setLocked,
  shiftElement,
  ungroupElements,
  type DropTarget,
  type EditedElement,
  type Insertable,
  type MovedElement,
} from './layers'

/* ---- element edits shared by the Layers rail and the element panel ---- */

export function saveFrameHtml(frame: Frame, html: string) {
  recordUpdate(frame.id, { html: frame.html }, { html })
  applyFrameHtml(frame, html)
}

function applyFrameHtml(frame: Frame, html: string) {
  useStore.getState().patchFrameLocal(frame.id, { html })
  api.updateFrame(frame.id, { html }).catch(console.error)
}

/** The frame as the store holds it now: a menu can stay open while a
 *  collaborator edits, and its edit must start from the current markup. */
function latest(frame: Frame): Frame {
  return useStore.getState().canvas?.frames.find((f) => f.id === frame.id) ?? frame
}

/** The inserts the menus offer, with the label each shows. */
export const INSERT_KINDS: [Insertable, string][] = [
  ['box', 'Box'],
  ['text', 'Text'],
  ['heading', 'Heading'],
  ['button', 'Button'],
]

/** Remove the layers, except locked ones; false when nothing was removed. A
 *  selector that no longer resolves (a collaborator rewrote the frame under
 *  the pick) drops the stale pick, so it cannot stand in for a frame selection. */
export function deleteLayers(frame: Frame, selectors: string[]): boolean {
  const current = latest(frame)
  const html = removeElements(
    current.html,
    selectors.filter((s) => !isLocked(current.html, s)),
  )
  const store = useStore.getState()
  store.setSelectedElement(null)
  store.setElementPanelOpen(false)
  if (html === null) return false
  saveFrameHtml(current, html)
  return true
}

export function deleteLayer(frame: Frame, selector: string): boolean {
  return deleteLayers(frame, [selector])
}

/** Hide or show the layers; false when none of them resolves. */
export function hideLayers(frame: Frame, selectors: string[], hidden: boolean): boolean {
  const current = latest(frame)
  const html = setHidden(current.html, selectors, hidden)
  if (html === null) return false
  saveFrameHtml(current, html)
  return true
}

/** Lock or unlock the layers; false when none of them resolves. */
export function lockLayers(frame: Frame, selectors: string[], locked: boolean): boolean {
  const current = latest(frame)
  const html = setLocked(current.html, selectors, locked)
  if (html === null) return false
  saveFrameHtml(current, html)
  return true
}

/* a layer edit that changes the tree keeps the rail on the new layer: the
   selector it lands on is the one the rail and the frame outline now use */
function commitEdit(frame: Frame, edited: EditedElement | null): boolean {
  if (!edited) return false
  saveFrameHtml(frame, edited.html)
  const store = useStore.getState()
  store.select(frame.id)
  store.setSelectedElement({ frameId: frame.id, selector: edited.selector })
  return true
}

/** Wrap the layers in one group, selected as the group. */
export function groupLayers(frame: Frame, selectors: string[]): boolean {
  const current = latest(frame)
  return commitEdit(current, groupElements(current.html, selectors))
}

/** Replace the groups among the layers with their members. */
export function ungroupLayers(frame: Frame, selectors: string[]): boolean {
  const current = latest(frame)
  const html = ungroupElements(current.html, selectors)
  if (html === null) return false
  saveFrameHtml(current, html)
  useStore.getState().setSelectedElement(null)
  return true
}

/** Insert a standard element after the layer at `selector`, or at the end of
 *  the frame when there is none, and select it. */
export function insertLayer(frame: Frame, selector: string | null, kind: Insertable): boolean {
  const current = latest(frame)
  return commitEdit(current, insertElement(current.html, selector, INSERTABLE[kind]))
}

/** ⌫ on the canvas: a picked element is always what goes, never the frame
 *  around it — a pick whose frame or selector no longer exists (deleted or
 *  rewritten by a collaborator) is dropped rather than falling through to
 *  the frames. Frames only go when nothing is picked. Returns false when
 *  the key had nothing to act on. */
export function deleteSelection(): boolean {
  const s = useStore.getState()
  const frames = s.canvas?.frames ?? []
  const picked = s.selectedElement
  if (picked) {
    const pickedFrame = frames.find((f) => f.id === picked.frameId)
    if (pickedFrame) deleteLayer(pickedFrame, picked.selector)
    else s.pickElement(null)
    return true
  }
  const selected = frames.filter((f) => s.selectedIds.includes(f.id))
  if (!selected.length) return false
  deleteFramesTracked(selected)
  return true
}

export function duplicateLayer(frame: Frame, selector: string) {
  const html = duplicateElement(frame.html, selector)
  if (html !== null) saveFrameHtml(frame, html)
}

/** Swap one element's markup; false when the selector no longer resolves. */
export function replaceLayerHtml(frame: Frame, selector: string, outerHtml: string): boolean {
  const html = replaceElement(frame.html, selector, outerHtml)
  if (html === null) return false
  saveFrameHtml(frame, html)
  return true
}

/** Upload an image and place it at the pick (or the end of the frame's body);
 *  false when the selector no longer resolves. */
export async function insertImageLayer(frame: Frame, selector: string | null, file: File): Promise<boolean> {
  const { url } = await api.uploadAsset(frame.canvasId, file)
  const current = useStore.getState().canvas?.frames.find((f) => f.id === frame.id) ?? frame
  const html = placeImage(current.html, selector, url, file.name.replace(/\.[^.]+$/, ''))
  if (html === null) return false
  saveFrameHtml(current, html)
  return true
}

/* a moved element keeps the selection: its selector changes with its
   position, so the rail and the frame outline have to be pointed at the new one */
function commitMove(frame: Frame, moved: MovedElement | null): boolean {
  if (!moved) return false
  saveFrameHtml(frame, moved.html)
  const store = useStore.getState()
  store.select(frame.id)
  store.setSelectedElement({ frameId: frame.id, selector: moved.selector })
  return true
}

/** Drop the element next to, or into, another; false when nothing moved. */
export function moveLayer(frame: Frame, selector: string, target: DropTarget): boolean {
  return commitMove(frame, moveElement(frame.html, selector, target))
}

/** Move the element from one frame into another, next to or into the target.
 *  Both frames are saved as one undo step, and the element stays selected
 *  where it landed. */
function moveLayerAcross(from: Frame, selector: string, to: Frame, target: DropTarget): boolean {
  const moved = moveElementAcross(from.html, selector, to.html, target)
  if (!moved) return false
  recordUpdates([
    { frameId: from.id, before: { html: from.html }, after: { html: moved.from } },
    { frameId: to.id, before: { html: to.html }, after: { html: moved.to } },
  ])
  applyFrameHtml(from, moved.from)
  applyFrameHtml(to, moved.to)
  const store = useStore.getState()
  store.select(to.id)
  store.setSelectedElement({ frameId: to.id, selector: moved.selector })
  return true
}

/** Finish a drag that began on `pressed`: the element is moved, into `into`
 *  (the frame of the row it was dropped on) or within `pressed` itself, as the
 *  store holds the frames now. A frame whose HTML changed during the gesture
 *  drops nothing — a path selector can survive a collaborator's edit while
 *  pointing at a different element (a same-tag sibling inserted above shifts
 *  every nth-of-type below it). False when nothing moved. */
export function dropLayer(pressed: Frame, selector: string, target: DropTarget, into: Frame = pressed): boolean {
  const s = useStore.getState()
  const frame = s.canvas?.frames.find((f) => f.id === pressed.id)
  if (!frame || frame.html !== pressed.html || isLocked(frame.html, selector)) return false
  if (into.id === frame.id) return moveLayer(frame, selector, target)
  const dest = s.canvas?.frames.find((f) => f.id === into.id)
  if (!dest || dest.html !== into.html) return false
  return moveLayerAcross(frame, selector, dest, target)
}

/** Step the element one layer up (-1) or down (1) among its siblings. */
export function shiftLayer(frame: Frame, selector: string, dir: -1 | 1): boolean {
  if (isLocked(frame.html, selector)) return false
  return commitMove(frame, shiftElement(frame.html, selector, dir))
}
