/**
 * Turns GitHub release notes (Markdown or the HTML GitHub renders from it) into the list of
 * Polish bullet points. The notes have a "Co nowego" section followed by an English "What's new".
 */
export function polishNoteLines(notes: string): string[] {
  const polish = notes.split(/what.?s new/i)[0]
  return polish
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(#+|[-*•])\s*/, '').trim())
    .filter((line) => line && !/^co nowego:?$/i.test(line))
}
