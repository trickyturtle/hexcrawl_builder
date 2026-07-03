export function isSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickDirectory() {
  return window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' })
}

export async function readJson(dirHandle, filename) {
  try {
    const fh = await dirHandle.getFileHandle(filename)
    const file = await fh.getFile()
    return JSON.parse(await file.text())
  } catch (e) {
    if (e.name === 'NotFoundError') return null
    throw e
  }
}

export async function writeJson(dirHandle, filename, data) {
  const fh = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}
