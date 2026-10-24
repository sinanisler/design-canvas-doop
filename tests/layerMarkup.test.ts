// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  INSERTABLE,
  buildLayerTree,
  groupElements,
  insertElement,
  isLocked,
  removeElements,
  setHidden,
  setLocked,
  ungroupElements,
} from '../src/lib/layers'

const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`

describe('setHidden', () => {
  it('hides a layer inline and remembers the display it had', () => {
    const hidden = setHidden(page('<p style="display:flex">a</p>'), ['p:nth-of-type(1)'], true)
    expect(hidden).toContain('display: none')
    expect(hidden).toContain('data-doop-hidden="flex"')
    expect(buildLayerTree(hidden!)[0]?.hidden).toBe(true)
  })

  it('shows the layer again with exactly what it had, and drops the marker', () => {
    const hidden = setHidden(page('<p style="display:flex">a</p>'), ['p:nth-of-type(1)'], true)!
    const shown = setHidden(hidden, ['p:nth-of-type(1)'], false)!
    expect(shown).toContain('display: flex')
    expect(shown).not.toContain('data-doop-hidden')
    expect(buildLayerTree(shown)[0]?.hidden).toBe(false)
  })

  it('leaves no style attribute behind when the layer had none', () => {
    const shown = setHidden(setHidden(page('<p>a</p>'), ['p:nth-of-type(1)'], true)!, ['p:nth-of-type(1)'], false)
    expect(shown).toContain('<p>a</p>')
  })

  it('returns null when nothing resolves', () => {
    expect(setHidden(page('<p>a</p>'), ['section:nth-of-type(1)'], true)).toBeNull()
  })
})

describe('setLocked and isLocked', () => {
  it('locks a box and everything inside it', () => {
    const locked = setLocked(page('<section><p>a</p></section>'), ['section:nth-of-type(1)'], true)!
    expect(isLocked(locked, 'section:nth-of-type(1)')).toBe(true)
    expect(isLocked(locked, 'section:nth-of-type(1) > p:nth-of-type(1)')).toBe(true)
  })

  it('unlocks again', () => {
    const locked = setLocked(page('<section><p>a</p></section>'), ['section:nth-of-type(1)'], true)!
    const open = setLocked(locked, ['section:nth-of-type(1)'], false)!
    expect(isLocked(open, 'section:nth-of-type(1)')).toBe(false)
    expect(buildLayerTree(open)[0]?.locked).toBe(false)
  })
})

describe('groupElements', () => {
  it('wraps siblings in one display:contents group where the first stood', () => {
    const grouped = groupElements(page('<p>a</p><span>x</span><p>b</p>'), ['p:nth-of-type(1)', 'p:nth-of-type(2)'])
    expect(grouped?.html).toContain('<div data-doop-group="" style="display:contents"><p>a</p><p>b</p></div>')
    expect(grouped?.selector).toBe('body:nth-of-type(1) > div:nth-of-type(1)')
  })

  it('refuses members that are not siblings', () => {
    expect(
      groupElements(page('<section><p>a</p></section><p>b</p>'), [
        'section:nth-of-type(1) > p:nth-of-type(1)',
        'body > p',
      ]),
    ).toBeNull()
  })

  it('refuses a single layer', () => {
    expect(groupElements(page('<p>a</p>'), ['p:nth-of-type(1)'])).toBeNull()
  })

  it('refuses a parent that cannot hold a group', () => {
    expect(
      groupElements(page('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>'), [
        'tbody:nth-of-type(1) > tr:nth-of-type(1)',
        'tbody:nth-of-type(1) > tr:nth-of-type(2)',
      ]),
    ).toBeNull()
  })

  it('is shown as a group in the tree', () => {
    const grouped = groupElements(page('<p>a</p><p>b</p>'), ['p:nth-of-type(1)', 'p:nth-of-type(2)'])!
    const [group] = buildLayerTree(grouped.html)
    expect(group?.group).toBe(true)
    expect(group?.label).toBe('group')
    expect(group?.children).toHaveLength(2)
  })
})

describe('ungroupElements', () => {
  it('puts the members back where the group stood', () => {
    const grouped = groupElements(page('<p>a</p><span>x</span><p>b</p>'), ['p:nth-of-type(1)', 'p:nth-of-type(2)'])!
    const flat = ungroupElements(grouped.html, [grouped.selector])!
    expect(flat).toContain('<p>a</p><p>b</p><span>x</span>')
    expect(flat).not.toContain('data-doop-group')
  })

  it('returns null when the selector is not a group', () => {
    expect(ungroupElements(page('<p>a</p>'), ['p:nth-of-type(1)'])).toBeNull()
  })
})

describe('insertElement', () => {
  it('places the snippet after the element and selects it', () => {
    const inserted = insertElement(page('<p>a</p>'), 'p:nth-of-type(1)', INSERTABLE.heading)!
    expect(inserted.html).toContain('<p>a</p><h2')
    expect(inserted.selector).toBe('body:nth-of-type(1) > h2:nth-of-type(1)')
  })

  it('appends to the body when there is no selector', () => {
    const inserted = insertElement(page('<p>a</p>'), null, INSERTABLE.text)!
    expect(inserted.html.indexOf('Text')).toBeGreaterThan(inserted.html.indexOf('<p>a</p>'))
    expect(inserted.selector).toBe('body:nth-of-type(1) > p:nth-of-type(2)')
  })

  it('returns null when the selector no longer resolves', () => {
    expect(insertElement(page('<p>a</p>'), 'section:nth-of-type(1)', INSERTABLE.box)).toBeNull()
  })
})

describe('removeElements', () => {
  it('removes every layer named, resolving them all before any change', () => {
    const html = removeElements(page('<p>a</p><p>b</p><p>c</p>'), ['p:nth-of-type(1)', 'p:nth-of-type(3)'])!
    expect(html).toContain('<p>b</p>')
    expect(html).not.toContain('<p>a</p>')
    expect(html).not.toContain('<p>c</p>')
  })

  it('returns null when none resolve', () => {
    expect(removeElements(page('<p>a</p>'), ['section:nth-of-type(1)'])).toBeNull()
  })
})
