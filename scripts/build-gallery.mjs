import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, isAbsolute, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)))
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

function isInside(directoryPath, candidatePath) {
  const relativePath = relative(directoryPath, candidatePath)

  return relativePath === ''
    || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
}

function assertRepositoryDirectory(directoryPath, parentPath) {
  const directoryStats = lstatSync(directoryPath)
  const canonicalPath = realpathSync(directoryPath)

  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error(`Refusing non-directory or symbolic link: ${repositoryPath(directoryPath)}`)
  }

  if (canonicalPath !== directoryPath || !isInside(parentPath, canonicalPath)) {
    throw new Error(`Refusing directory outside repository: ${repositoryPath(directoryPath)}`)
  }

  return directoryPath
}

function ensureRepositoryDirectory(directoryPath, parentPath) {
  try {
    mkdirSync(directoryPath)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }

  return assertRepositoryDirectory(directoryPath, parentPath)
}

function assertRegularSource(sourcePath, sourceDirectory) {
  const sourceStats = lstatSync(sourcePath)
  const canonicalPath = realpathSync(sourcePath)

  if (!sourceStats.isFile() || sourceStats.isSymbolicLink() || !isInside(sourceDirectory, canonicalPath)) {
    throw new Error(`Refusing non-regular or external wallpaper source: ${repositoryPath(sourcePath)}`)
  }
}

function writePreview(sourcePath, previewPath, previewDirectory, category) {
  const temporaryDirectory = mkdtempSync(join(previewDirectory, '.gallery-build-'))
  const temporaryPreviewPath = join(temporaryDirectory, 'preview.webp')

  try {
    execFileSync('cwebp', [
      '-quiet',
      '-q', '76',
      '-resize', String(category.previewWidth), '0',
      sourcePath,
      '-o', temporaryPreviewPath,
    ])

    const previewStats = lstatSync(temporaryPreviewPath)
    if (!previewStats.isFile() || previewStats.isSymbolicLink()) {
      throw new Error(`Refusing non-regular generated preview: ${repositoryPath(temporaryPreviewPath)}`)
    }

    renameSync(temporaryPreviewPath, previewPath)
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

function writeGallery(gallery) {
  const temporaryDirectory = mkdtempSync(join(repositoryRoot, '.gallery-build-'))
  const temporaryGalleryPath = join(temporaryDirectory, 'gallery.json')

  try {
    writeFileSync(temporaryGalleryPath, `${JSON.stringify(gallery, null, 2)}\n`, { flag: 'wx' })
    renameSync(temporaryGalleryPath, join(repositoryRoot, 'gallery.json'))
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

function buildCategory(category) {
  const sourceDirectory = join(repositoryRoot, category.directory)
  assertRepositoryDirectory(sourceDirectory, repositoryRoot)

  const previewRoot = ensureRepositoryDirectory(join(repositoryRoot, 'Previews'), repositoryRoot)
  const previewDirectory = join(repositoryRoot, 'Previews', category.directory)
  ensureRepositoryDirectory(previewDirectory, previewRoot)

  return readdirSync(sourceDirectory)
    .filter(filename => filename.endsWith('.png'))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
    .map(filename => {
      const sourcePath = join(sourceDirectory, filename)
      const previewPath = join(previewDirectory, filename.replace(/\.png$/, '.webp'))
      assertRegularSource(sourcePath, sourceDirectory)
      writePreview(sourcePath, previewPath, previewDirectory, category)

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

writeGallery(gallery)

console.log(`Built ${gallery.desktopTablet.length + gallery.mobile.length} wallpaper previews.`)
