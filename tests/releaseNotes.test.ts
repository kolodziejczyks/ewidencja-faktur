import { describe, expect, it } from 'vitest'
import { polishNoteLines } from '../src/shared/releaseNotes'

describe('polishNoteLines', () => {
  it('reads the Polish bullets from Markdown notes', () => {
    const md = `## Co nowego\n\n- Pierwsza zmiana.\n- Druga zmiana.\n\n## What's new\n\n- First change.`
    expect(polishNoteLines(md)).toEqual(['Pierwsza zmiana.', 'Druga zmiana.'])
  })

  it('reads the Polish bullets from the HTML GitHub renders', () => {
    const html = `Co nowego\nPierwsza zmiana.\nDruga — z myślnikiem.\n\nWhat’s new\nFirst change.`
    expect(polishNoteLines(html)).toEqual(['Pierwsza zmiana.', 'Druga — z myślnikiem.'])
    expect(polishNoteLines('<h2>Co nowego</h2><ul><li>Jedna</li><li>Dwie</li></ul><h2>What\'s new</h2>')).toEqual(['Jedna', 'Dwie'])
  })
})
