import type { ImageKey } from '@/api/types'
import { cn } from '@/lib/utils'

const WIDTHS = [320, 640, 960] as const

function srcSet(image: ImageKey, ext: 'avif' | 'webp') {
  return WIDTHS.map((w) => `/nfts/${image}-${w}.${ext} ${w}w`).join(', ')
}

interface Props {
  image: ImageKey
  alt: string
  sizes: string
  className?: string
  priority?: boolean
}

/** Imagem responsiva (AVIF/WebP) com dimensões fixas para evitar CLS. */
export function NftImage({ image, alt, sizes, className, priority }: Props) {
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(image, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(image, 'webp')} sizes={sizes} />
      <img
        src={`/nfts/${image}-640.webp`}
        alt={alt}
        width={640}
        height={640}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={cn('aspect-square h-auto w-full object-cover', className)}
      />
    </picture>
  )
}
