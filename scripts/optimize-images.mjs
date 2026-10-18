// Gera variantes responsivas (AVIF/WebP) dos assets originais exportados do Figma.
import { readdir, mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SRC = 'assets/figma'
const OUT = 'public/nfts'
const WIDTHS = [320, 640, 960]

await mkdir(OUT, { recursive: true })
for (const file of await readdir(SRC)) {
  if (!file.endsWith('.png')) continue
  const name = path.basename(file, '.png')
  for (const w of WIDTHS) {
    const img = sharp(path.join(SRC, file)).resize(w, w)
    await img.clone().avif({ quality: 50, effort: 6 }).toFile(`${OUT}/${name}-${w}.avif`)
    await img.clone().webp({ quality: 72 }).toFile(`${OUT}/${name}-${w}.webp`)
  }
  console.log('ok', name)
}
