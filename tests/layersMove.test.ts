// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buildLayerTree, holdsChildren, moveElement, moveElementAcross } from '../src/lib/layers'

const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`

describe('moveElement', () => {
  it('moves an element into a box that can hold it', () => {
    const moved = moveElement(page('<section></section><p>hello</p>'), 'p:nth-of-type(1)', {
      selector: 'section:nth-of-type(1)',
      place: 'inside',
    })
    expect(moved?.html).toContain('<section><p>hello</p></section>')
    expect(moved?.selector).toBe('body:nth-of-type(1) > section:nth-of-type(1) > p:nth-of-type(1)')
  })

  it.each(['input', 'hr', 'textarea'])('refuses an inside drop into <%s>, which would lose the content', (tag) => {
    const html = page(`<${tag}></${tag}><p>hello</p>`)
    const moved = moveElement(html, 'p:nth-of-type(1)', { selector: `${tag}:nth-of-type(1)`, place: 'inside' })
    expect(moved).toBeNull()
  })

  it.each(['select', 'table', 'tr'])('refuses an inside drop into <%s>, whose children the parser rewrites', (tag) => {
    const html = page(`<${tag}></${tag}><p>hello</p>`)
    const moved = moveElement(html, 'p:nth-of-type(1)', { selector: `${tag}:nth-of-type(1)`, place: 'inside' })
    expect(moved).toBeNull()
  })

  it('refuses any move the saved markup would not preserve, listed or not', () => {
    /* a <p> is not on the rail's list and the DOM happily nests one in
       another, but the parser closes the outer paragraph at the inner one's
       start tag — the round-trip check is what catches a tag the list does not */
    const moved = moveElement(page('<p>outer</p><p>hello</p>'), 'p:nth-of-type(2)', {
      selector: 'p:nth-of-type(1)',
      place: 'inside',
    })
    expect(moved).toBeNull()
  })

  it('still drops next to an element that cannot hold children', () => {
    const moved = moveElement(page('<input><p>hello</p>'), 'p:nth-of-type(1)', {
      selector: 'input:nth-of-type(1)',
      place: 'before',
    })
    expect(moved?.html).toContain('<p>hello</p><input>')
  })
})

describe('moveElementAcross', () => {
  it('takes the element out of its frame and into the other, next to the target', () => {
    const moved = moveElementAcross(
      page('<div><p>A</p><p>B</p></div>'),
      'p:nth-of-type(2)',
      page('<section></section><footer>end</footer>'),
      { selector: 'footer:nth-of-type(1)', place: 'before' },
    )
    expect(moved?.from).toContain('<div><p>A</p></div>')
    expect(moved?.to).toContain('<section></section><p>B</p><footer>end</footer>')
    expect(moved?.selector).toBe('body:nth-of-type(1) > p:nth-of-type(1)')
  })

  it('drops into the top of a box in the other frame', () => {
    const moved = moveElementAcross(page('<p>hello</p>'), 'p:nth-of-type(1)', page('<section><h2>T</h2></section>'), {
      selector: 'section:nth-of-type(1)',
      place: 'inside',
    })
    expect(moved?.to).toContain('<section><p>hello</p><h2>T</h2></section>')
    expect(moved?.from).not.toContain('hello')
  })

  it('refuses an inside drop into a void element', () => {
    const from = page('<p>hello</p>')
    expect(
      moveElementAcross(from, 'p:nth-of-type(1)', page('<input>'), {
        selector: 'input:nth-of-type(1)',
        place: 'inside',
      }),
    ).toBeNull()
  })

  it('renames an id the target already uses, and rewrites the carried rule to match', () => {
    const from = page('<style>#hero { color: red }</style><section id="hero">moved</section>')
    const to = page('<section id="hero">already here</section>')
    const moved = moveElementAcross(from, 'section#hero', to, { selector: 'section#hero', place: 'after' })
    expect(moved?.to).toContain('<section id="hero">already here</section>')
    expect(moved?.to).toMatch(/<section id="hero-copy">moved<\/section>/)
    expect(moved?.to).toContain('#hero-copy { color: red }')
    expect(moved?.selector).toBe('#hero-copy')
  })

  it('keeps an id the target does not use', () => {
    const moved = moveElementAcross(page('<section id="card">x</section>'), 'section#card', page('<main></main>'), {
      selector: 'main:nth-of-type(1)',
      place: 'inside',
    })
    expect(moved?.selector).toBe('#card')
  })

  it('carries the class rules that reach the element, not the tag rules', () => {
    const from = page(
      '<style>.card { padding: 4px } .card:hover { color: blue } .card span { margin: 0 } p { font-size: 9px } .other { x: 1 }</style><div class="card"><span>x</span></div>',
    )
    const moved = moveElementAcross(from, 'div.card', page('<main></main>'), {
      selector: 'main:nth-of-type(1)',
      place: 'inside',
    })
    expect(moved?.to).toContain('.card { padding: 4px }')
    expect(moved?.to).toContain('.card:hover { color: blue }')
    expect(moved?.to).toContain('.card span { margin: 0 }')
    expect(moved?.to).not.toContain('font-size: 9px')
    expect(moved?.to).not.toContain('.other')
    /* the source keeps its own rules: other elements still use them */
    expect(moved?.from).toContain('.card { padding: 4px }')
  })

  it('does not copy a rule the target already holds', () => {
    const from = page('<style>.card { padding: 4px }</style><div class="card">x</div>')
    const to = page('<style>.card { padding: 4px }</style><main></main>')
    const moved = moveElementAcross(from, 'div.card', to, { selector: 'main:nth-of-type(1)', place: 'inside' })
    expect(moved?.to?.split('.card { padding: 4px }').length).toBe(2)
  })

  it('returns null when the source selector no longer resolves', () => {
    expect(
      moveElementAcross(page('<p>a</p>'), 'section:nth-of-type(1)', page(''), { selector: 'body', place: 'inside' }),
    ).toBeNull()
  })
})

describe('holdsChildren', () => {
  it('names the elements the rail may offer an inside drop on', () => {
    expect(holdsChildren('div')).toBe(true)
    expect(holdsChildren('INPUT')).toBe(false)
    expect(holdsChildren('hr')).toBe(false)
  })

  it('classifies a void element as a box, so the guard is what stops the drop', () => {
    const [input] = buildLayerTree(page('<input>'))
    expect(input?.kind).toBe('box')
    expect(holdsChildren(input!.tag)).toBe(false)
  })
})
