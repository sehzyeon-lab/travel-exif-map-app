#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const version = value('--version');
const message = value('--message');
const notes = [];
for (let i = 0; i < process.argv.length; i += 1) if (process.argv[i] === '--note') notes.push(process.argv[i + 1]);

if (!/^\d+\.\d+\.\d+$/.test(version || '') || !message?.trim() || notes.length === 0 || notes.some((note) => !note?.includes('|'))) {
  console.error('Usage: npm run release:commit -- --version 2.1.1 --message "feat: ..." --note "제목|설명|✨"');
  process.exit(1);
}

const releaseNotes = notes.map((note) => {
  const [title, desc, icon = '✨'] = note.split('|').map((part) => part.trim());
  if (!title || !desc) throw new Error('Each --note requires "제목|설명|아이콘".');
  return { title, desc, icon };
});
const escape = (text) => text.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
const source = `export const CURRENT_VERSION = '${version}';\n\nexport const RELEASE_NOTES = [\n${releaseNotes.map((note) => `  { icon: '${escape(note.icon)}', title: '${escape(note.title)}', desc: '${escape(note.desc)}' }`).join(',\n')}\n];\n`;
writeFileSync('src/releaseNotes.js', source, 'utf8');

const gradlePath = 'android/app/build.gradle';
const currentGradle = readFileSync(gradlePath, 'utf8');
const currentVersion = currentGradle.match(/versionName\s+"([^"]+)"/)?.[1];
const gradle = currentGradle
  .replace(/versionCode\s+\d+/, (match) => currentVersion === version ? match : `versionCode ${Number(match.match(/\d+/)[0]) + 1}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
writeFileSync(gradlePath, gradle, 'utf8');

execFileSync('git', ['add', '--all'], { stdio: 'inherit' });
execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' });
