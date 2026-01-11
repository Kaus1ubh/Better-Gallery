import { MaxRectsPacker } from 'maxrects-packer'
import type { ImageItem } from '../types'

export interface PackedTile {
    id: number
    x: number
    y: number
    width: number
    height: number
    imageId: number
    imagePath: string
    thumbPath: string
    data: ImageItem
}

export function packImages(
    images: ImageItem[],
    containerWidth: number,
    targetRowHeight: number
): { height: number; tiles: PackedTile[] } {
    if (images.length === 0 || containerWidth <= 0) return { height: 0, tiles: [] }

    const options = {
        smart: true,
        pot: false,
        border: 0,
        allowRotation: false, // Don't rotate photos
        tag: false,
    }

    const packer = new MaxRectsPacker(containerWidth, 8000, 2, options) // 8000px height per bin, 2px padding

    const boxInputs = images.map(img => {
        // Validation: Ensure we don't divide by zero or propagate NaNs
        let wComp = img.width
        let hComp = img.height

        if (!wComp || !hComp || hComp === 0) {
            // Fallback for corrupted metadata
            wComp = 100
            hComp = 100
        }

        const aspect = wComp / hComp
        const h = targetRowHeight
        // Ensure w is a finite positive integer
        let w = Math.round(h * aspect)
        if (Number.isNaN(w) || w <= 0) w = h // Square fallback

        return {
            width: w,
            height: h,
            data: img
        }
    })

    packer.addArray(boxInputs as any)

    const tiles: PackedTile[] = []
    let totalHeight = 0

    packer.bins.forEach(bin => {
        bin.rects.forEach(rect => {
            tiles.push({
                id: rect.data.id,
                x: rect.x,
                y: rect.y + totalHeight,
                width: rect.width,
                height: rect.height,
                imageId: rect.data.id,
                imagePath: rect.data.path,
                thumbPath: rect.data.thumb_path,
                data: rect.data
            })
        })
        totalHeight += bin.height
    })

    const contentHeight = tiles.reduce((max, t) => Math.max(max, t.y + t.height), 0)

    return { height: contentHeight, tiles }
}
