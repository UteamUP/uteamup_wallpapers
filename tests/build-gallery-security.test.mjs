import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const sourceScript = fileURLToPath(new URL('../scripts/build-gallery.mjs', import.meta.url))

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'uteamup-wallpapers-'))
  const binaryDirectory = join(root, 'test-bin')
  const logPath = join(root, 'cwebp.log')

  for (const directory of ['Desktop-Tablet', 'Mobile', 'Previews', 'scripts']) {
    mkdirSync(join(root, directory), { recursive: true })
  }

  mkdirSync(binaryDirectory, { recursive: true })
  mkdirSync(join(root, 'Previews', 'Desktop-Tablet'), { recursive: true })
  mkdirSync(join(root, 'Previews', 'Mobile'), { recursive: true })
  writeFileSync(join(root, 'Desktop-Tablet', 'Uteamup_Light.png'), 'desktop source')
  writeFileSync(join(root, 'Mobile', 'Uteamup_Light_Mobile.png'), 'mobile source')
  copyFileSync(sourceScript, join(root, 'scripts', 'build-gallery.mjs'))

  const fakeCwebp = join(binaryDirectory, 'cwebp')
  writeFileSync(fakeCwebp, [
    '#!/usr/bin/env node',
    "const { appendFileSync, writeFileSync } = require('node:fs')",
    "appendFileSync(process.env.CWEBP_LOG, 'called\\n')",
    "const outputPath = process.argv[process.argv.indexOf('-o') + 1]",
    "writeFileSync(outputPath, 'preview')",
  ].join('\n'))
  chmodSync(fakeCwebp, 0o755)

  return { root, binaryDirectory, logPath }
}

function runBuild(fixture) {
  return spawnSync(process.execPath, [join(fixture.root, 'scripts', 'build-gallery.mjs')], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.binaryDirectory}${delimiter}${process.env.PATH ?? ''}`,
      CWEBP_LOG: fixture.logPath,
    },
  })
}

function removeFixture(fixture) {
  rmSync(fixture.root, { recursive: true, force: true })
}

test('builds previews and catalog for regular in-repository inputs', t => {
  const fixture = createFixture()
  t.after(() => removeFixture(fixture))

  const result = runBuild(fixture)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(existsSync(join(fixture.root, 'Previews', 'Desktop-Tablet', 'Uteamup_Light.webp')), true)
  assert.equal(existsSync(join(fixture.root, 'Previews', 'Mobile', 'Uteamup_Light_Mobile.webp')), true)
  assert.equal(JSON.parse(readFileSync(join(fixture.root, 'gallery.json'), 'utf8')).desktopTablet.length, 1)
})

test('rejects symlinked wallpaper inputs before invoking cwebp', t => {
  const fixture = createFixture()
  const outsideDirectory = mkdtempSync(join(tmpdir(), 'uteamup-wallpapers-outside-'))
  t.after(() => {
    removeFixture(fixture)
    rmSync(outsideDirectory, { recursive: true, force: true })
  })

  const outsideSource = join(outsideDirectory, 'outside.png')
  writeFileSync(outsideSource, 'private image')
  symlinkSync(outsideSource, join(fixture.root, 'Desktop-Tablet', '00_external.png'))

  const result = runBuild(fixture)

  assert.notEqual(result.status, 0)
  assert.equal(existsSync(fixture.logPath), false)
})

test('replaces output symlinks without changing their external targets', t => {
  const fixture = createFixture()
  const outsideDirectory = mkdtempSync(join(tmpdir(), 'uteamup-wallpapers-outside-'))
  t.after(() => {
    removeFixture(fixture)
    rmSync(outsideDirectory, { recursive: true, force: true })
  })

  const previewTarget = join(outsideDirectory, 'preview-target.webp')
  const galleryTarget = join(outsideDirectory, 'gallery-target.json')
  const previewPath = join(fixture.root, 'Previews', 'Desktop-Tablet', 'Uteamup_Light.webp')
  const galleryPath = join(fixture.root, 'gallery.json')
  writeFileSync(previewTarget, 'leave preview target unchanged')
  writeFileSync(galleryTarget, 'leave gallery target unchanged')
  symlinkSync(previewTarget, previewPath)
  symlinkSync(galleryTarget, galleryPath)

  const result = runBuild(fixture)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(previewTarget, 'utf8'), 'leave preview target unchanged')
  assert.equal(readFileSync(galleryTarget, 'utf8'), 'leave gallery target unchanged')
  assert.equal(lstatSync(previewPath).isSymbolicLink(), false)
  assert.equal(lstatSync(galleryPath).isSymbolicLink(), false)
  assert.equal(JSON.parse(readFileSync(galleryPath, 'utf8')).desktopTablet.length, 1)
  assert.ok(readdirSync(fixture.root).every(entry => !entry.startsWith('.gallery-build-')))
})
