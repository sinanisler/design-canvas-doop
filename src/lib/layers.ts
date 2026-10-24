/**
 * The Layers panel's view of a frame: the element tree of its HTML, parsed
 * on the parent side (the iframe is sandboxed, so the panel cannot walk the
 * live document). Every node carries the same selector the frame runtime
 * produces for it (frameRuntime.ts cssPath), which is what lets a row in the
 * panel and an outline in the frame refer to the same element.
 */

export type LayerKind = 'box' | 'text' | 'image' | 'svg'

/* Layer state lives in the markup, so it is saved with the frame, reaches
   every viewer, and survives an export. A group is a wrapper that takes no
   box of its own (display: contents); a hidden layer keeps the inline display
   it had in HIDDEN_ATTR; a locked layer refuses edits on the canvas and in the rail. */
export const GROUP_ATTR = 'data-doop-group'
export const LOCKED_ATTR = 'data-doop-locked'
export const HIDDEN_ATTR = 'data-doop-hidden'

export interface LayerNode {
  selector: string
  tag: string
  /** what the row shows: a text element shows its text, anything else its tag */
  label: string
  /** the first class (".hero") or id ("#nav") shown faint after the tag */
  detail: string
  kind: LayerKind
  children: LayerNode[]
  hidden: boolean
  locked: boolean
  group: boolean
}

/* markup that renders nothing of its own has no place in a layer list */
const HIDDEN_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR'])
const IMAGE_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS'])
/* elements the rail never offers an "inside" drop on: void elements
   (serialization drops anything prepended into them), raw-text elements
   (their content is text by definition) and restricted containers whose
   children the parser rewrites — a <p> dropped into a <select> is discarded
   on the next parse, one dropped into a <table> is hoisted out of it */
const NO_INSIDE_DROP = new Set([
  'AREA',
  'BASE',
  'BR',
  'COL',
  'EMBED',
  'HR',
  'IMG',
  'INPUT',
  'LINK',
  'META',
  'SOURCE',
  'TRACK',
  'WBR',
  'TEXTAREA',
  'SCRIPT',
  'STYLE',
  'TITLE',
  'IFRAME',
  'SELECT',
  'OPTGROUP',
  'OPTION',
  'DATALIST',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'COLGROUP',
])

/** True when any layer element may be dropped into this one. The list is
 *  the rail's hint; `moveElement` re-parses its result and refuses any move
 *  the parser would not preserve, so a tag missing here still cannot lose
 *  content. */
export function holdsChildren(tag: string): boolean {
  return !NO_INSIDE_DROP.has(tag.toUpperCase())
}

function escapeIdent(id: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
}

/** Mirror of the runtime's cssPath — keep the two in lockstep. */
export function elementPath(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur !== cur.ownerDocument.documentElement) {
    if (cur.id) {
      parts.unshift('#' + escapeIdent(cur.id))
      break
    }
    let nth = 1
    for (let s = cur.previousElementSibling; s; s = s.previousElementSibling) {
      if (s.tagName === cur.tagName) nth++
    }
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${nth})`)
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

/** The nodes above the one with `selector`, outermost first — the rows that
 *  must be open for its row to show. Walked on the tree rather than derived
 *  from the selector string: a path anchored on an #id says nothing about the
 *  elements above that id. Null when the selector is not in the tree. */
/** The node a selector names, anywhere in the tree. */
export function findLayer(nodes: LayerNode[], selector: string): LayerNode | null {
  for (const n of nodes) {
    if (n.selector === selector) return n
    const hit = findLayer(n.children, selector)
    if (hit) return hit
  }
  return null
}

/** The name a node shows for itself: "aside.rail", "#nav", or its text. */
export function layerName(node: LayerNode): string {
  return node.detail ? `${node.tag}${node.detail}` : node.label
}

export function ancestorsOf(nodes: LayerNode[], selector: string): LayerNode[] | null {
  for (const node of nodes) {
    if (node.selector === selector) return []
    const below = ancestorsOf(node.children, selector)
    if (below) return [node, ...below]
  }
  return null
}

function ownText(el: Element): string {
  let text = ''
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === Node.TEXT_NODE) text += n.nodeValue ?? ''
  }
  return text.replace(/\s+/g, ' ').trim()
}

function detailOf(el: Element): string {
  if (el.id) return '#' + el.id
  const cls = el.getAttribute('class')?.trim().split(/\s+/)[0]
  return cls ? '.' + cls : ''
}

function toNode(el: Element): LayerNode {
  const tag = el.tagName.toLowerCase()
  const base = {
    selector: elementPath(el),
    tag,
    detail: detailOf(el),
    hidden: el.hasAttribute(HIDDEN_ATTR),
    locked: el.hasAttribute(LOCKED_ATTR),
    group: el.hasAttribute(GROUP_ATTR),
  }
  if (el.namespaceURI === 'http://www.w3.org/2000/svg') return { ...base, label: 'svg', kind: 'svg', children: [] }
  if (IMAGE_TAGS.has(el.tagName)) return { ...base, label: tag, kind: 'image', children: [] }
  const children = layerChildren(el)
  if (base.group) return { ...base, detail: '', label: 'group', kind: 'box', children }
  const text = ownText(el)
  if (children.length === 0 && text) {
    return { ...base, label: text.length > 60 ? text.slice(0, 57) + '…' : text, detail: '', kind: 'text', children }
  }
  return { ...base, label: tag, kind: 'box', children }
}

function layerChildren(el: Element): LayerNode[] {
  const out: LayerNode[] = []
  for (const child of el.children) {
    if (!HIDDEN_TAGS.has(child.tagName)) out.push(toNode(child))
  }
  return out
}

/** The frame's layer tree: the body's children, in document order. */
export function buildLayerTree(html: string): LayerNode[] {
  if (!html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return layerChildren(doc.body)
}

/** Keep the nodes whose label or detail matches `query`, plus their ancestors. */
export function filterLayers(nodes: LayerNode[], query: string): LayerNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const out: LayerNode[] = []
  for (const n of nodes) {
    const children = filterLayers(n.children, q)
    const hit = n.label.toLowerCase().includes(q) || n.detail.toLowerCase().includes(q) || n.tag.includes(q)
    if (hit || children.length) out.push({ ...n, children: hit ? n.children : children })
  }
  return out
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function serialize(doc: Document): string {
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

/** The element's own markup, for the clipboard. */
/* a selector from a stale tree may no longer parse or resolve — both are "gone" */
function find(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector)
  } catch {
    return null
  }
}

export function elementHtml(html: string, selector: string): string | null {
  return find(parse(html), selector)?.outerHTML ?? null
}

/** The frame's HTML with the element removed, or null when the selector no longer resolves. */
export function removeElement(html: string, selector: string): string | null {
  const doc = parse(html)
  const el = find(doc, selector)
  if (!el) return null
  el.remove()
  return serialize(doc)
}

/** The frame's HTML with the element's markup swapped for `outerHtml`. */
export function replaceElement(html: string, selector: string, outerHtml: string): string | null {
  const doc = parse(html)
  const el = find(doc, selector)
  if (!el) return null
  el.outerHTML = outerHtml
  return serialize(doc)
}

/** The frame's HTML with an image placed at the pick: a picked <img> gets the
 *  new src, a container gets the image appended, any other element gets it
 *  right after; no selector appends to <body>. Null when the selector no
 *  longer resolves. */
export function placeImage(html: string, selector: string | null, src: string, alt: string): string | null {
  const doc = parse(html)
  const target = selector ? find(doc, selector) : doc.body
  if (!target) return null
  if (target.tagName === 'IMG') {
    target.setAttribute('src', src)
    target.removeAttribute('srcset')
    return serialize(doc)
  }
  const img = doc.createElement('img')
  img.setAttribute('src', src)
  img.setAttribute('alt', alt)
  img.setAttribute('style', 'display:block;max-width:100%;height:auto')
  if (target === doc.body || holdsChildren(target.tagName)) target.append(img)
  else target.after(img)
  return serialize(doc)
}

/** The frame's HTML with a copy of the element inserted right after it. */
export function duplicateElement(html: string, selector: string): string | null {
  const doc = parse(html)
  const el = find(doc, selector)
  if (!el) return null
  const copy = el.cloneNode(true) as Element
  renameIds(doc, copy)
  el.after(copy)
  return serialize(doc)
}

/** Where a moved element lands relative to its target: as its previous or
 *  next sibling, or as its first child. */
export type DropPlace = 'before' | 'after' | 'inside'

export interface DropTarget {
  selector: string
  place: DropPlace
}

export interface MovedElement {
  html: string
  /** the element's selector after the move — its path changes with its position */
  selector: string
}

/* the neighbouring layer the rail shows: markup that draws nothing is stepped over */
function visibleSibling(el: Element, dir: -1 | 1): Element | null {
  let cur = dir === -1 ? el.previousElementSibling : el.nextElementSibling
  while (cur && HIDDEN_TAGS.has(cur.tagName)) cur = dir === -1 ? cur.previousElementSibling : cur.nextElementSibling
  return cur
}

/** True when the element already sits where the drop would put it, as the
 *  rail shows it — hopping over a hidden <script> is not a move. */
function alreadyAt(el: Element, at: Element, where: DropPlace): boolean {
  if (where === 'before') return visibleSibling(el, 1) === at
  if (where === 'after') return visibleSibling(el, -1) === at
  const first = at.firstElementChild
  return el === (first && HIDDEN_TAGS.has(first.tagName) ? visibleSibling(first, 1) : first)
}

function move(doc: Document, el: Element, at: Element, where: DropPlace): MovedElement | null {
  if (el === at || el.contains(at) || alreadyAt(el, at, where)) return null
  if (where === 'inside' && !holdsChildren(at.tagName)) return null
  if (where === 'inside') at.prepend(el)
  else if (where === 'before') at.before(el)
  else at.after(el)
  const html = serialize(doc)
  const selector = elementPath(el)
  /* the saved markup is what everyone re-parses: a move the parser would
     drop or hoist (into a void element, a <select>, a <table>) is no move */
  if (find(parse(html), selector)?.outerHTML !== el.outerHTML) return null
  return { html, selector }
}

/** The frame's HTML with the element moved next to, or into, the target.
 *  Null when either selector no longer resolves, the target sits inside the
 *  element (a node cannot hold itself), the target cannot hold it (an
 *  <input>, a <select>), or the element is already there. */
export function moveElement(html: string, selector: string, target: DropTarget): MovedElement | null {
  const doc = parse(html)
  const el = find(doc, selector)
  const at = find(doc, target.selector)
  if (!el || !at) return null
  return move(doc, el, at, target.place)
}

/** A layer moved out of one frame and into another: the source frame without
 *  it, the target frame with it, and the element's selector in the target. */
export interface CrossMovedElement {
  from: string
  to: string
  selector: string
}

/* the top-level blocks of a stylesheet, each as its whole text */
function topLevelRules(css: string): string[] {
  const rules: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        rules.push(css.slice(start, i + 1).trim())
        start = i + 1
      }
    }
  }
  return rules
}

function matchesSelector(el: Element, selector: string): boolean {
  try {
    return el.matches(selector)
  } catch {
    return false
  }
}

/* the look a moved element brings along: the class and id rules of its frame's
   own <style> blocks that reach it or anything inside it. Tag-only rules stay
   behind — they are the frame's global look, not the element's. At-rules
   (@media, @keyframes) are not carried. */
function styleRulesFor(doc: Document, root: Element): string[] {
  const css = [...doc.querySelectorAll('style')]
    .map((s) => s.textContent ?? '')
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const nodes = [root, ...root.querySelectorAll('*')]
  return topLevelRules(css).filter((rule) => {
    const open = rule.indexOf('{')
    const selector = rule.slice(0, open).trim()
    if (open < 0 || selector.startsWith('@') || !/[.#]/.test(selector)) return false
    /* a :hover or ::before rule reaches the element through its base selector */
    const base = selector.replace(/::?[\w-]+(\([^)]*\))?/g, '')
    return nodes.some((n) => matchesSelector(n, base))
  })
}

/* a carried rule follows the ids the moved copy was given a fresh name for */
function renameInSelector(rule: string, renamed: Map<string, string>): string {
  if (renamed.size === 0) return rule
  const open = rule.indexOf('{')
  const selector = rule.slice(0, open).replace(/#(-?[_a-zA-Z][\w-]*)/g, (match, id: string) => {
    const next = renamed.get(id)
    return next ? `#${next}` : match
  })
  return selector + rule.slice(open)
}

const normalizeCss = (css: string) => css.replace(/\s+/g, ' ')

/* appends the rules the target does not already hold, in one <style> block */
function carryRules(doc: Document, rules: string[]) {
  const have = normalizeCss([...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n'))
  const fresh = rules.filter((rule) => !have.includes(normalizeCss(rule)))
  if (fresh.length === 0) return
  const style = doc.createElement('style')
  style.textContent = fresh.join('\n')
  doc.head.append(style)
}

/** The element moved out of `fromHtml` and into `toHtml`, next to or into the
 *  target. The two frames are separate documents, so an id the target already
 *  uses is renamed on the way in, and the class and id rules the element is
 *  styled by are carried across. Null when either selector no longer resolves,
 *  the target cannot hold it, or the markup would not survive the trip. */
export function moveElementAcross(
  fromHtml: string,
  selector: string,
  toHtml: string,
  target: DropTarget,
): CrossMovedElement | null {
  const from = parse(fromHtml)
  const el = find(from, selector)
  const to = parse(toHtml)
  const at = find(to, target.selector)
  if (!el || !at) return null
  if (target.place === 'inside' && !holdsChildren(at.tagName)) return null
  const rules = styleRulesFor(from, el)
  const moved = to.importNode(el, true)
  const renamed = renameIds(to, moved, (id) => !!to.getElementById(id))
  if (target.place === 'inside') at.prepend(moved)
  else if (target.place === 'before') at.before(moved)
  else at.after(moved)
  el.remove()
  carryRules(
    to,
    rules.map((rule) => renameInSelector(rule, renamed)),
  )
  const movedSelector = elementPath(moved)
  const toHtmlOut = serialize(to)
  /* the saved markup is what everyone re-parses: a move the parser would
     drop or hoist is no move */
  if (find(parse(toHtmlOut), movedSelector)?.outerHTML !== moved.outerHTML) return null
  return { from: serialize(from), to: toHtmlOut, selector: movedSelector }
}

/** The frame's HTML with the element swapped past the layer above (-1) or
 *  below (1) it. Null at either end of the list. */
export function shiftElement(html: string, selector: string, dir: -1 | 1): MovedElement | null {
  const doc = parse(html)
  const el = find(doc, selector)
  const sibling = el && visibleSibling(el, dir)
  if (!el || !sibling) return null
  return move(doc, el, sibling, dir === -1 ? 'before' : 'after')
}

/* ---- layer state, grouping, insertion, removal: one parse per edit, and
   every selector is resolved before anything changes, so a removal cannot
   shift the path of a layer still to be handled ---- */

function resolveAll(doc: Document, selectors: string[]): Element[] {
  return selectors.map((s) => find(doc, s)).filter((el): el is Element => el !== null)
}

/** Markup the Insert menu adds: plain elements that read as design on any frame. */
export const INSERTABLE = {
  box: '<div style="width:160px;height:96px;border-radius:8px;background:#e5e7eb"></div>',
  text: '<p style="margin:0;font-size:16px;line-height:1.5">Text</p>',
  heading: '<h2 style="margin:0;font-size:32px;line-height:1.2">Heading</h2>',
  button:
    '<button style="padding:10px 16px;border:0;border-radius:8px;background:#17171b;color:#fff;font:inherit">Button</button>',
} as const

export type Insertable = keyof typeof INSERTABLE

/** An edit that leaves one new element: the frame's HTML, and that element's
 *  selector, so the rail can select it. */
export interface EditedElement {
  html: string
  selector: string
}

/** The frame's HTML with `snippet` placed after the element at `selector`, or
 *  appended to the body when there is none. Null when the selector no longer
 *  resolves or the snippet holds no element. */
export function insertElement(html: string, selector: string | null, snippet: string): EditedElement | null {
  const doc = parse(html)
  const piece = parse(snippet).body.firstElementChild
  if (!piece) return null
  const node = doc.importNode(piece, true)
  if (selector === null) doc.body.append(node)
  else {
    const at = find(doc, selector)
    if (!at) return null
    at.after(node)
  }
  return { html: serialize(doc), selector: elementPath(node) }
}

/** The frame's HTML without the elements at `selectors`; null when none resolve. */
export function removeElements(html: string, selectors: string[]): string | null {
  const doc = parse(html)
  const els = resolveAll(doc, selectors)
  if (els.length === 0) return null
  for (const el of els) el.remove()
  return serialize(doc)
}

/** The frame's HTML with the elements at `selectors` hidden or shown again. A
 *  hidden element is given an inline display:none and keeps the inline display
 *  it had, so showing it again restores exactly what was there. */
export function setHidden(html: string, selectors: string[], hidden: boolean): string | null {
  const doc = parse(html)
  const els = resolveAll(doc, selectors)
  if (els.length === 0) return null
  for (const el of els) {
    const style = (el as HTMLElement).style
    if (hidden && !el.hasAttribute(HIDDEN_ATTR)) {
      el.setAttribute(HIDDEN_ATTR, style.display)
      style.display = 'none'
    } else if (!hidden && el.hasAttribute(HIDDEN_ATTR)) {
      style.display = el.getAttribute(HIDDEN_ATTR) ?? ''
      el.removeAttribute(HIDDEN_ATTR)
      if (!el.getAttribute('style')) el.removeAttribute('style')
    }
  }
  return serialize(doc)
}

/** The frame's HTML with the elements at `selectors` locked or unlocked; null when none resolve. */
export function setLocked(html: string, selectors: string[], locked: boolean): string | null {
  const doc = parse(html)
  const els = resolveAll(doc, selectors)
  if (els.length === 0) return null
  for (const el of els) {
    if (locked) el.setAttribute(LOCKED_ATTR, '')
    else el.removeAttribute(LOCKED_ATTR)
  }
  return serialize(doc)
}

/** True when the element, or a box it sits inside, is locked. */
export function isLocked(html: string, selector: string): boolean {
  return find(parse(html), selector)?.closest(`[${LOCKED_ATTR}]`) != null
}

/** The element's inline `translate` offset, in design px: where a canvas move
 *  starts from. A move writes `translate`, not position, so it never reflows
 *  the siblings around the element, and it works for any position mode. */
export function translateOf(html: string, selector: string): { x: number; y: number } {
  const el = find(parse(html), selector) as HTMLElement | null
  const nums = [...(el?.style.getPropertyValue('translate') ?? '').matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]))
  return { x: nums[0] ?? 0, y: nums[1] ?? 0 }
}

/** The frame's HTML with the elements at `selectors` wrapped in one group, put
 *  where the first of them stood. Group members must be siblings inside a box
 *  that can hold them. Null otherwise. The group is display:contents, so it
 *  changes nothing about the layout it wraps. */
export function groupElements(html: string, selectors: string[]): EditedElement | null {
  const doc = parse(html)
  const members = [...new Set(resolveAll(doc, selectors))]
  if (members.length < 2) return null
  const parent = members[0]?.parentElement
  if (!parent || !holdsChildren(parent.tagName) || members.some((el) => el.parentElement !== parent)) return null
  members.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  const group = doc.createElement('div')
  group.setAttribute(GROUP_ATTR, '')
  group.setAttribute('style', 'display:contents')
  members[0]?.before(group)
  for (const el of members) group.append(el)
  return { html: serialize(doc), selector: elementPath(group) }
}

/** The frame's HTML with each group among `selectors` replaced by its members,
 *  in place. Null when none of them is a group. */
export function ungroupElements(html: string, selectors: string[]): string | null {
  const doc = parse(html)
  const groups = resolveAll(doc, selectors).filter((el) => el.hasAttribute(GROUP_ATTR))
  if (groups.length === 0) return null
  for (const group of groups) group.replaceWith(...Array.from(group.childNodes))
  return serialize(doc)
}

/* attributes whose value is an id, or a space-separated list of ids */
const ID_REF_ATTRS = new Set([
  'for',
  'form',
  'list',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-owns',
])
/* SVG paint servers, clips, masks, filters and markers: url(#id), in any attribute or inline style */
const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g

/** Give every id inside `copy` that `clashes` names a fresh name and point the
 *  copy's own references at the new names: label for, #fragment links, aria
 *  relations, SVG use/href and url(#…) paints. Ids must stay unique — a copied
 *  id makes selectors resolve to the original subtree — and a reference left
 *  on the old name would keep wiring the copy to the original. References to
 *  ids outside the copy are left alone. Returns the old → new names. */
function renameIds(doc: Document, copy: Element, clashes: (id: string) => boolean = () => true): Map<string, string> {
  const renamed = new Map<string, string>()
  const taken = new Set<string>()
  const withId = [copy, ...copy.querySelectorAll('[id]')].filter((n) => n.id && clashes(n.id))
  for (const node of withId) {
    let next = `${node.id}-copy`
    for (let n = 2; doc.getElementById(next) || taken.has(next); n++) next = `${node.id}-copy-${n}`
    renamed.set(node.id, next)
    taken.add(next)
    node.id = next
  }
  if (renamed.size === 0) return renamed
  const rename = (id: string) => renamed.get(id) ?? id
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    for (const { name, value } of [...node.attributes]) {
      let next = value
      if (name === 'href' || name === 'xlink:href') {
        if (value.startsWith('#')) next = `#${rename(value.slice(1))}`
      } else if (ID_REF_ATTRS.has(name)) {
        next = value.replace(/\S+/g, rename)
      }
      next = next.replace(URL_REF, (_, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`)
      if (next !== value) node.setAttribute(name, next)
    }
    /* a <style> carried inside the copy can name its own defs too */
    if (node.tagName === 'STYLE' && node.textContent) {
      const css = node.textContent.replace(
        URL_REF,
        (_, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`,
      )
      if (css !== node.textContent) node.textContent = css
    }
  }
  return renamed
}
