/**
 * Writes build/release-notes.md for the current package.json version from changelog.json.
 * electron-builder puts it in the GitHub release body; the app's update banner shows the Polish part.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const changelog = JSON.parse(readFileSync('changelog.json', 'utf8'))
const entry = changelog.find((e) => e.version === version)

if (!entry) {
  console.error(`changelog.json has no entry for version ${version}. Add one before releasing.`)
  process.exit(1)
}

const list = (lines) => lines.map((l) => `- ${l}`).join('\n')
mkdirSync('build', { recursive: true })
writeFileSync('build/release-notes.md', `## Co nowego\n\n${list(entry.pl)}\n\n## What's new\n\n${list(entry.en)}\n`)
console.log(`Release notes for ${version} written to build/release-notes.md`)
