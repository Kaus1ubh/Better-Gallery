import type { ImageItem } from '../types'

export interface PageLayout {
    pageIndex: number
    tiles: JustifiedTile[]
}

export interface JustifiedTile {
    data: ImageItem
    x: number
    y: number
    width: number
    height: number
}

const MAX_DEPTH = 1000 // Increased from 30 to prevent grey gaps in dense pages

// Calculate Aspect Ratio of a list of images (Median approach)
function getGroupMedianAR(list: ImageItem[]) {
    if (list.length === 0) return 1
    // Sort simple copy to find median
    const sorted = [...list].sort((a, b) => {
        const arA = (a.width || 100) / (a.height || 100)
        const arB = (b.width || 100) / (b.height || 100)
        return arA - arB
    })
    const m = sorted[Math.floor(sorted.length / 2)]
    return (m.width || 100) / (m.height || 100)
}

function partitionSmart(
    rect: { x: number; y: number; w: number; h: number },
    images: ImageItem[],
    depth: number
): JustifiedTile[] {
    // Base Case
    if (images.length === 1) {
        return [{
            data: images[0],
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h
        }]
    }
    if (depth > MAX_DEPTH) return []

    const count = images.length

    // 1. Find Best Split Direction & Ratio
    // We test a few split points to find the one that creates two sub-rects
    // that roughly match the average AR of the sorted halves of the content.

    let bestScore = Infinity
    let bestSplit: { isVertical: boolean, splitIndex: number, ratio: number } | null = null

    // Sort images by Aspect Ratio for analysis (Visual Logic)
    const sortedImages = [...images].sort((a, b) => {
        const arA = (a.width || 100) / (a.height || 100)
        const arB = (b.width || 100) / (b.height || 100)
        return arA - arB
    })

    // Test Vertical vs Horizontal
    const directions = [true, false]

    for (const isVert of directions) {
        // Try partitioning indices
        const start = Math.max(1, Math.floor(count * 0.2))
        const end = Math.min(count - 1, Math.ceil(count * 0.8))

        // Step size for speed optimization if count is large
        const step = count > 10 ? 2 : 1

        for (let i = start; i <= end; i += step) {
            const ratio = i / count

            // Dimensions of new slots
            const w1 = isVert ? rect.w * ratio : rect.w
            const h1 = isVert ? rect.h : rect.h * ratio

            const w2 = isVert ? rect.w * (1 - ratio) : rect.w
            const h2 = isVert ? rect.h : rect.h * (1 - ratio)

            const slotAR1 = w1 / h1
            const slotAR2 = w2 / h2

            // Adaptive Match Scoring:
            // We check two configurations:
            // Config A: Slot 1 gets Talls (0..i), Slot 2 gets Wides (i..end)
            // Config B: Slot 1 gets Wides (count-i..count), Slot 2 gets Talls (0..count-i)

            // Config A Score
            const setA1 = sortedImages.slice(0, i)
            const setA2 = sortedImages.slice(i)
            const errA = Math.abs(Math.log(slotAR1 / getGroupMedianAR(setA1))) +
                Math.abs(Math.log(slotAR2 / getGroupMedianAR(setA2)))

            // Config B Score
            const setB1 = sortedImages.slice(count - i)
            const setB2 = sortedImages.slice(0, count - i)
            const errB = Math.abs(Math.log(slotAR1 / getGroupMedianAR(setB1))) +
                Math.abs(Math.log(slotAR2 / getGroupMedianAR(setB2)))

            const bestErr = Math.min(errA, errB)

            // Small penalty for extreme aspect ratios (thin strips are ugly)
            const stripPenalty = (slotAR1 > 4 || slotAR1 < 0.25 || slotAR2 > 4 || slotAR2 < 0.25) ? 1.5 : 0

            if ((bestErr + stripPenalty) < bestScore) {
                bestScore = bestErr + stripPenalty
                bestSplit = { isVertical: isVert, splitIndex: i, ratio }
            }
        }
    }

    // Fallback if no split found (rare)
    if (!bestSplit) {
        // Default to simple half split
        bestSplit = { isVertical: rect.w > rect.h, splitIndex: Math.floor(count / 2), ratio: 0.5 }
    }

    const { isVertical, splitIndex, ratio } = bestSplit

    // 2. Perform Adaptive Assignment based on the best split we found
    const w1 = isVertical ? rect.w * ratio : rect.w
    const h1 = isVertical ? rect.h : rect.h * ratio
    const w2 = isVertical ? rect.w * (1 - ratio) : rect.w
    const h2 = isVertical ? rect.h : rect.h * (1 - ratio)

    const ar1 = w1 / h1

    // Re-evaluate who matches Slot 1 better: Talls or Wides?
    // (We computed this in the loop, but easier to just re-check here)
    const talls = sortedImages.slice(0, splitIndex)
    const wides = sortedImages.slice(splitIndex)

    // Compare Talls vs Wides for Slot 1
    const distTalls = Math.abs(Math.log(ar1 / getGroupMedianAR(talls)))

    // For Wides, we need the RIGHT subset size. 
    // If we put Wides in Slot 1, we must take 'splitIndex' amount of Wides.
    // That means taking from the END of the sorted list.
    const widesForSlot1 = sortedImages.slice(count - splitIndex)
    const tallsForSlot2 = sortedImages.slice(0, count - splitIndex)

    const distWides = Math.abs(Math.log(ar1 / getGroupMedianAR(widesForSlot1)))

    let set1, set2

    if (distTalls < distWides) {
        // Config A: Slot 1 gets Talls
        set1 = talls
        set2 = wides
    } else {
        // Config B: Slot 1 gets Wides from end
        set1 = widesForSlot1
        set2 = tallsForSlot2
    }

    const rect1 = { x: rect.x, y: rect.y, w: w1, h: h1 }
    const rect2 = isVertical
        ? { x: rect.x + w1, y: rect.y, w: w2, h: h2 }
        : { x: rect.x, y: rect.y + h1, w: w2, h: h2 }

    return [
        ...partitionSmart(rect1, set1, depth + 1),
        ...partitionSmart(rect2, set2, depth + 1)
    ]
}

export function computePagedLayout(
    images: ImageItem[],
    containerWidth: number,
    containerHeight: number,
    baseTileSize: number
): PageLayout[] {
    if (!containerWidth || !containerHeight || images.length === 0) return []

    const screenArea = containerWidth * containerHeight
    const tileArea = baseTileSize * baseTileSize
    // Cap items per page to prevent layout engine freeze/stack overflow on huge screens/tiny zoom
    // 200 items per page is plenty for a visual gallery.
    const calculatedCount = Math.floor(screenArea / tileArea)
    const optimalCount = Math.max(1, Math.min(calculatedCount, 200))

    const pages: PageLayout[] = []
    let pageIndex = 0

    for (let i = 0; i < images.length; i += optimalCount) {
        let chunk = images.slice(i, i + optimalCount)

        // Pass raw chunk to partitioner. 
        // Partitioner will sort and adapt internally.
        const pageTiles = partitionSmart(
            { x: 0, y: 0, w: containerWidth, h: containerHeight },
            chunk,
            0
        )

        pages.push({
            pageIndex,
            tiles: pageTiles
        })
        pageIndex++
    }

    return pages
}
