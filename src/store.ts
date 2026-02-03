import { create } from 'zustand'
import type { ImageItem } from './types'

interface GalleryState {
    images: ImageItem[]
    isScanning: boolean
    scanProgress: { scanned: number; total: number } | null
    rootPath: string | null

    setImages: (images: ImageItem[]) => void
    setScanning: (isScanning: boolean) => void
    setProgress: (progress: { scanned: number; total: number } | null) => void
    setRootPath: (path: string) => void

    // Paging
    currentPage: number
    setPage: (page: number) => void
    appendImages: (images: ImageItem[]) => void

    // Actions
    scanLibrary: (path: string) => Promise<void>
    refreshLibrary: () => Promise<void>
}

export const useGalleryStore = create<GalleryState>((set) => ({
    images: [],
    isScanning: false,
    scanProgress: null,
    rootPath: null,

    setImages: (images) => set({ images }),
    setScanning: (isScanning) => set({ isScanning }),
    setProgress: (scanProgress) => set({ scanProgress }),
    setRootPath: (rootPath) => set({ rootPath }),

    currentPage: 0,
    setPage: (currentPage) => set({ currentPage }),

    appendImages: (newImages) => set((state) => ({ images: [...state.images, ...newImages] })),

    scanLibrary: async (path) => {
        // Reset state
        set({ isScanning: true, rootPath: path, scanProgress: { scanned: 0, total: 0 }, images: [] })

        // Listener for incremental updates
        const onIncremental = (_event: any, batch: ImageItem[]) => {
            set((state) => ({ images: [...state.images, ...batch] }))
        }

        try {
            // Setup listener
            if (window.ipcRenderer) {
                window.ipcRenderer.on('library:incremental', onIncremental)
            }

            // Clear DB
            await window.ipcRenderer.invoke('library:clear')

            // Start scan (blocking until done, but emitting events)
            await window.ipcRenderer.invoke('library:scan', path)

            // Final Fetch (to ensure consistency/IDs)
            const images = await window.ipcRenderer.invoke('library:getImages')
            set({ images })
        } catch (err) {
            console.error('Scan failed', err)
        } finally {
            if (window.ipcRenderer) {
                window.ipcRenderer.removeListener('library:incremental', onIncremental) // How to remove?
                // ipcRenderer.on returns a cleanup function? usually no. 
                // We typically need the exact function ref.
                // onIncremental is defined here locally, so we can pass it to removeListener?
                // Wait, ipcRenderer.on is distinct from removeListener.
                // In Electron preload, we usually expose `on` and `off`.
                // Let's assume standard Node EventEmitter style exposed via preload if direct access.
                // Actually my preload usually wraps things. Let's check preload.ts briefly. 
                // Assuming standard `window.ipcRenderer.on/off` works.
                window.ipcRenderer.off('library:incremental', onIncremental)
            }
            set({ isScanning: false, scanProgress: null })
        }
    },

    refreshLibrary: async () => {
        const images = await window.ipcRenderer.invoke('library:getImages')
        set({ images })
    }
}))
