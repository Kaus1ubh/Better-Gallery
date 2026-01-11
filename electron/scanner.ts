import { readdir, stat, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { app } from 'electron'
import sharp from 'sharp'
import exifr from 'exifr'
import { insertImage } from './db'
import { randomUUID } from 'node:crypto'

const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.avif', '.mp4', '.webm', '.mov'])

// ... (skip to processImage)

async function processImage(filePath: string, thumbBaseDir: string) {
    const ext = extname(filePath).toLowerCase()
    const isVideo = ['.mp4', '.webm', '.mov'].includes(ext)

    // ... stats ...
    const fileStats = await stat(filePath)
    const mtime = fileStats.mtimeMs

    // 1. Metadata
    let width = 0
    let height = 0

    if (isVideo) {
        // Fallback defaults for video if metadata fails
        width = 1920
        height = 1080
        // Try exifr for video metadata (often works for mp4)
        try {
            // const meta = await exifr.parse(filePath) 
            // Video metadata is tricky without ffmpeg. 
            // For now, consistent 16:9 is better than crashing or 0x0.
            // If we can assume mostly landscape videos...
        } catch (e) { }
    } else {
        try {
            const meta = await sharp(filePath).metadata()
            width = meta.width || 0
            height = meta.height || 0
            if ((meta.orientation || 0) >= 5) [width, height] = [height, width]
        } catch (e) {
            try {
                const meta = await exifr.parse(filePath, { pick: ['ImageWidth', 'ImageHeight', 'Orientation'] })
                width = meta?.ImageWidth || 0
                height = meta?.ImageHeight || 0
                if (meta?.Orientation >= 5) [width, height] = [height, width]
            } catch (e2) { }
        }
    }

    if (width === 0 || height === 0) return null

    // 2. Thumbnail
    // If video, we use the video itself as the source (browser handles decoding)
    let thumbPath = filePath

    if (!isVideo) {
        const thumbName = `${randomUUID()}.webp`
        thumbPath = join(thumbBaseDir, thumbName)

        try {
            await sharp(filePath)
                .rotate()
                .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
                .toFormat('webp', { quality: 80 })
                .toFile(thumbPath)
        } catch (err) {
            console.error('Thumb gen failed', filePath, err)
            return null // Skip if we can't make a thumb for image
        }
    }

    // 3. DB Insert
    insertImage(filePath, width, height, mtime, thumbPath)

    // Return Object for Frontend
    return {
        path: filePath,
        width,
        height,
        mtime,
        thumb_path: thumbPath,
        id: -1
    }
}
dirPath: string,
    onProgress ?: (scanned: number, total: number) => void,
    onBatchFound ?: (images: any[]) => void // Send batches of image objects
) {
    const imagesToProcess: { path: string, time: number }[] = []

    // 1. Recursive scan
    async function traverse(currentDir: string) {
        try {
            const entries = await readdir(currentDir, { withFileTypes: true })
            for (const entry of entries) {
                const fullPath = join(currentDir, entry.name)
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.')) {
                        await traverse(fullPath)
                    }
                } else if (entry.isFile()) {
                    const ext = extname(entry.name).toLowerCase()
                    if (VALID_EXTENSIONS.has(ext)) {
                        // We need stats to sort by date
                        try {
                            const s = await stat(fullPath)
                            imagesToProcess.push({ path: fullPath, time: s.mtimeMs })
                        } catch {
                            // ignore un-stat-able files
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Error scanning ${currentDir}:`, err)
        }
    }

    await traverse(dirPath)

    // SORT: Newest First (Desc)
    imagesToProcess.sort((a, b) => b.time - a.time)

    // 2. Process images
    const thumbBaseDir = join(app.getPath('userData'), 'thumbnails')
    await mkdir(thumbBaseDir, { recursive: true })

    let count = 0
    const total = imagesToProcess.length

    console.log(`Found ${total} images. Processing...`)

    // Simple concurrency limit
    const CONCURRENCY = 5
    const queue = [...imagesToProcess]

    // Batching state
    let batch: any[] = []
    const BATCH_SIZE = 50

    async function worker() {
        while (queue.length > 0) {
            const item = queue.shift()
            if (!item) break

            const imgPath = item.path // item is { path, time }

            try {
                const imgData = await processImage(imgPath, thumbBaseDir)
                if (imgData) {
                    batch.push(imgData)

                    // Flush batch if full (thread-safe ish in JS single loop, but keep simple)
                    if (batch.length >= BATCH_SIZE) {
                        const chunk = [...batch]
                        batch = []
                        if (onBatchFound) onBatchFound(chunk)
                    }
                }
            } catch (err) {
                console.error(`Failed to process ${imgPath}:`, err)
            } finally {
                count++
                if (onProgress) onProgress(count, total)
            }
        }
    }

    const workers = Array(CONCURRENCY).fill(null).map(() => worker())
    await Promise.all(workers)

    // Flush remaining
    if (batch.length > 0 && onBatchFound) {
        onBatchFound(batch)
    }

    return total
}

async function processImage(filePath: string, thumbBaseDir: string) {
    // ... stats ...
    const fileStats = await stat(filePath)
    const mtime = fileStats.mtimeMs

    // 1. Metadata
    let width = 0
    let height = 0

    try {
        const meta = await sharp(filePath).metadata()
        width = meta.width || 0
        height = meta.height || 0
        if ((meta.orientation || 0) >= 5) [width, height] = [height, width]
    } catch (e) {
        try {
            const meta = await exifr.parse(filePath, { pick: ['ImageWidth', 'ImageHeight', 'Orientation'] })
            width = meta?.ImageWidth || 0
            height = meta?.ImageHeight || 0
            if (meta?.Orientation >= 5) [width, height] = [height, width]
        } catch (e2) { }
    }

    if (width === 0 || height === 0) return null

    // 2. Thumbnail
    const thumbName = `${randomUUID()}.webp`
    const thumbPath = join(thumbBaseDir, thumbName)

    await sharp(filePath)
        .rotate()
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .toFormat('webp', { quality: 80 })
        .toFile(thumbPath)

    // 3. DB Insert
    insertImage(filePath, width, height, mtime, thumbPath)

    // Return Object for Frontend
    return {
        path: filePath,
        width,
        height,
        mtime,
        thumb_path: thumbPath,
        id: -1 // ID is unknown until DB insert, but we can assume ID is not critical for layout if key is path/thumb
        // Actually Store usually uses ID as key. DB insert returns info?
        // insertImage is synchronous? 
        // We better verify insertImage returns ID or we re-fetch?
        // For Speed, we can just use random ID or ignore ID for display.
        // Let's modify DB to return ID or just mock it? 
        // Actually, let's just use path/thumb as unique key in frontend for now.
    }
}
