










import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILTIN = /^node:/

function findUnpacked() {
  if (process.argv[2]) return process.argv[2]
  const releaseDir = join(root, 'release')
  if (!existsSync(releaseDir)) fail(`No release directory. Run the build first.`)
  for (const version of readdirSync(releaseDir).sort().reverse()) {
    const candidate = join(releaseDir, version, 'win-unpacked')
    if (existsSync(candidate)) return candidate
  }
  return fail('No win-unpacked directory found under release/.')
}

function fail(message) {
  console.error(`\n  x ${message}\n`)
  process.exit(1)
}


function externalsOf(mainBundle) {
  const source = readFileSync(mainBundle, 'utf8')
  const found = new Set()
  for (const match of source.matchAll(/require\("([^"]+)"\)/g)) {
    const name = match[1]
    if (!BUILTIN.test(name) && name !== 'electron' && !name.startsWith('.')) found.add(name)
  }
  return [...found].sort()
}

const unpacked = findUnpacked()
const exe = readdirSync(unpacked).find((file) => file.endsWith('.exe') && file !== 'elevate.exe')
if (!exe) fail(`No application executable in ${unpacked}`)


const asar = join(unpacked, 'resources', 'app.asar')
const plain = join(unpacked, 'resources', 'app')
const appDir = existsSync(asar) ? asar : plain
if (!existsSync(appDir)) fail('Neither resources/app.asar nor resources/app exists.')

console.log(`  Verifying ${unpacked}`)
console.log(`  App bundle: ${existsSync(asar) ? 'app.asar' : 'app/ (asar disabled)'}`)

const mainBundle = join(root, 'out', 'main', 'index.js')
if (!existsSync(mainBundle)) fail('out/main/index.js is missing — run the build first.')

const externals = externalsOf(mainBundle)



const script = `
process.noAsar = false;
const fs = require('fs');
const path = require('path');
const appDir = ${JSON.stringify(appDir)};
const problems = [];

for (const rel of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html', 'package.json']) {
  const target = path.join(appDir, ...rel.split('/'));
  try { fs.readFileSync(target); }
  catch (err) { problems.push('missing entry: ' + rel); }
}

for (const name of ${JSON.stringify(externals)}) {
  try { require(require.resolve(name, { paths: [appDir] })); }
  catch (err) { problems.push('module ' + name + ' :: ' + String(err.message).split('\\n')[0]); }
}

console.log(problems.length ? 'PROBLEMS\\n' + problems.join('\\n') : 'ALL_OK');
`

const result = run(script).trim()
if (result !== 'ALL_OK') {
  fail(`Packaged build is broken:\n    ${result.replace(/^PROBLEMS\n/, '').split('\n').join('\n    ')}`)
}

console.log('  + entry points present')
console.log(`  + ${externals.length} external module(s) load: ${externals.join(', ')}`)
console.log('\n  Package verified.\n')

function run(script) {
  return execFileSync(join(unpacked, exe), ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    windowsHide: true
  })
}
