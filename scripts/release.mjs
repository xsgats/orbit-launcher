/*
 * Builds and publishes a release to GitHub.
 *
 *   node scripts/release.mjs patch          bump 1.0.0 -> 1.0.1, build, publish
 *   node scripts/release.mjs minor|major    same, larger bump
 *   node scripts/release.mjs 1.2.3          set an explicit version
 *   node scripts/release.mjs                republish the current version
 *
 *   --notes "text"   release notes (default: commit subjects since the last tag)
 *   --draft          create the release as a draft (clients will NOT see it)
 *   --dry-run        build and report, upload nothing
 *   --no-git         skip the commit/tag/push step
 *
 * Auth comes from the gh CLI, so no token needs to live in the environment.
 * Uploading latest.yml is what actually delivers the update; the .exe.blockmap
 * is what makes the next update a differential download instead of a full one.
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageFile = join(root, 'package.json')

function fail(message) {
  console.error(`\n  x ${message}\n`)
  process.exit(1)
}

function step(message) {
  console.log(`\n  > ${message}`)
}

function run(command) {
  execSync(command, { cwd: root, stdio: 'inherit', env: process.env })
}

function capture(command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/* ---------------------------------------------------------------- */
/* Arguments                                                        */
/* ---------------------------------------------------------------- */

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const option = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? null : argv[index + 1] ?? null
}

const dryRun = flag('dry-run')
const draft = flag('draft')

/* The first bare word that is not the value of --notes. */
let bump = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) continue
  if (i > 0 && argv[i - 1] === '--notes') continue
  bump = argv[i]
  break
}

/* ---------------------------------------------------------------- */
/* Version                                                          */
/* ---------------------------------------------------------------- */

const manifest = JSON.parse(readFileSync(packageFile, 'utf8'))
const previousVersion = manifest.version

function nextVersion(current, kind) {
  if (!kind) return current
  if (/^\d+\.\d+\.\d+/.test(kind)) return kind

  const [major, minor, patch] = current.split('.').map(Number)
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
  return fail(`Unknown version argument "${kind}". Use patch, minor, major, or an explicit x.y.z.`)
}

const version = nextVersion(previousVersion, bump)
const tag = `v${version}`

if (!dryRun) {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' })
  } catch {
    fail('gh is not authenticated. Run: gh auth login')
  }
}

if (capture(`git tag -l ${tag}`) === tag) {
  fail(`Tag ${tag} already exists locally. Pick a different version.`)
}

if (capture(`gh release view ${tag} --json tagName -q .tagName`) === tag) {
  fail(`Release ${tag} already exists on GitHub. Bump the version instead of republishing.`)
}

/* ---------------------------------------------------------------- */
/* Notes                                                            */
/* ---------------------------------------------------------------- */

const lastTag = capture('git describe --tags --abbrev=0')
const autoNotes = lastTag
  ? capture(`git log ${lastTag}..HEAD --pretty=format:"- %s"`)
  : capture('git log -12 --pretty=format:"- %s"')

const notes = option('notes') ?? autoNotes ?? ''

/* ---------------------------------------------------------------- */
/* Build                                                            */
/* ---------------------------------------------------------------- */

console.log(`\n  Orbit Launcher release`)
console.log(`  ${previousVersion} -> ${version}${dryRun ? '   (dry run)' : ''}`)

if (version !== previousVersion) {
  step(`Setting package.json version to ${version}`)
  manifest.version = version
  writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)
}

try {
  step('Building')
  run('npm run build')

  step('Packaging')
  run('npx electron-builder --win --publish never')

  step('Verifying the packaged build')
  run('npm run verify:package')
} catch (err) {
  if (version !== previousVersion) {
    manifest.version = previousVersion
    writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)
    console.error(`\n  Reverted package.json to ${previousVersion}.`)
  }
  fail(`Build failed: ${err.message}`)
}

/* ---------------------------------------------------------------- */
/* Assets                                                           */
/* ---------------------------------------------------------------- */

const outDir = join(root, 'release', version)
const assets = [
  join(outDir, `OrbitLauncher-Setup-${version}.exe`),
  join(outDir, `OrbitLauncher-Setup-${version}.exe.blockmap`),
  join(outDir, 'latest.yml')
]

for (const asset of assets) {
  if (!existsSync(asset)) fail(`Expected build output is missing: ${asset}`)
}

if (dryRun) {
  console.log('\n  Dry run — nothing uploaded. Would have published:')
  for (const asset of assets) console.log(`    ${asset}`)
  console.log(`\n  Tag: ${tag}\n`)
  process.exit(0)
}

/* ---------------------------------------------------------------- */
/* Git                                                              */
/* ---------------------------------------------------------------- */

/*
 * Commit and tag before publishing so the release always points at the exact
 * source the installer was built from. Without this the tag lands on whatever
 * the default branch happened to be, which is not what shipped.
 */
if (!flag('no-git')) {
  const branch = capture('git rev-parse --abbrev-ref HEAD') || 'main'

  if (capture('git status --porcelain')) {
    step('Committing changes')
    run('git add -A')
    run(`git commit -m "Release ${version}"`)
  }

  step(`Tagging ${tag} and pushing ${branch}`)
  run(`git tag ${tag}`)
  run(`git push origin ${branch}`)
  run(`git push origin ${tag}`)
}

/* ---------------------------------------------------------------- */
/* Publish                                                          */
/* ---------------------------------------------------------------- */

step(`Creating GitHub release ${tag}`)

const args = [
  'release',
  'create',
  tag,
  ...assets,
  '--title',
  `Orbit Launcher ${version}`,
  '--notes',
  notes || `Orbit Launcher ${version}`
]
if (draft) args.push('--draft')

execFileSync('gh', args, { cwd: root, stdio: 'inherit' })

const url = capture(`gh release view ${tag} --json url -q .url`)

console.log(`\n  Published ${tag}`)
if (url) console.log(`  ${url}`)
console.log(
  draft
    ? '\n  This is a DRAFT — clients will not see it until you publish it on GitHub.\n'
    : '\n  Clients will pick this up on next launch, or within 6 hours if already open.\n'
)
