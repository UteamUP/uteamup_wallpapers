import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, posix, relative } from 'node:path'

const repositoryRoot = new URL('../', import.meta.url).pathname
const categories = [
  { key: 'desktopTablet', directory: 'Desktop-Tablet', width: 1586, height: 992, previewWidth: 640 },
  { key: 'mobile', directory: 'Mobile', width: 941, height: 1672, previewWidth: 360 },
]

function displayName(filename) {
  const withoutExtension = basename(filename, '.png')
    .replace(/^Uteamup_(Light|Dark)_?/, '')
    .replace(/_Mobile$/, '')

  if (!withoutExtension) return 'Classic'
  if (/^\d+$/.test(withoutExtension)) return `Classic ${withoutExtension}`
  return withoutExtension.replaceAll('_', ' ')
}

function theme(filename) {
  return filename.includes('_Dark') ? 'dark' : 'light'
}

function idFor(category, filename) {
  return `${category}-${basename(filename, '.png')}`
    .toLowerCase()
    .replaceAll('_', '-')
}

function repositoryPath(path) {
  return relative(repositoryRoot, path).split('/').join(posix.sep)
}

function buildCategory(category) {
  const sourceDirectory = join(repositoryRoot, category.directory)
  const previewDirectory = join(repositoryRoot, 'Previews', category.directory)
  mkdirSync(previewDirectory, { recursive: true })

  return readdirSync(sourceDirectory)
    .filter(filename => filename.endsWith('.png'))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
    .map(filename => {
      const sourcePath = join(sourceDirectory, filename)
      const previewPath = join(previewDirectory, filename.replace(/\.png$/, '.webp'))
      execFileSync('cwebp', [
        '-quiet',
        '-q', '76',
        '-resize', String(category.previewWidth), '0',
        sourcePath,
        '-o', previewPath,
      ])

      return {
        id: idFor(category.key, filename),
        name: displayName(filename),
        theme: theme(filename),
        width: category.width,
        height: category.height,
        originalPath: repositoryPath(sourcePath),
        previewPath: repositoryPath(previewPath),
      }
    })
}

const gallery = {
  version: 1,
  repositoryUrl: 'https://github.com/UteamUP/uteamup_wallpapers',
  desktopTablet: buildCategory(categories[0]),
  mobile: buildCategory(categories[1]),
}

writeFileSync(
  join(repositoryRoot, 'gallery.json'),
  `${JSON.stringify(gallery, null, 2)}\n`,
)

console.log(`Built ${gallery.desktopTablet.length + gallery.mobile.length} wallpaper previews.`)
