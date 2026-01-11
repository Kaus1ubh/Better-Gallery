import { useRef, useMemo, useEffect, useState } from 'react'
import { useGalleryStore } from '../store'
import { computePagedLayout } from './justified-engine'
import { motion, AnimatePresence } from 'framer-motion'
import './gallery.scss'

interface GalleryCanvasProps {
    images: any[]
    tileSize: number
    onImageClick: (index: number) => void
}

export function GalleryCanvas({ images, tileSize, onImageClick }: GalleryCanvasProps) {
    const parentRef = useRef<HTMLDivElement>(null)
    const { currentPage, setPage } = useGalleryStore()

    // Dimensions
    const containerWidth = parentRef.current?.clientWidth || window.innerWidth
    const containerHeight = parentRef.current?.clientHeight || window.innerHeight

    const pages = useMemo(() => {
        // Pass container dimensions for paging
        if (!containerWidth || !containerHeight) return []
        return computePagedLayout(images, containerWidth, containerHeight, tileSize)
    }, [images, containerWidth, containerHeight, tileSize])

    const totalPages = pages.length
    const currentLayout = pages[currentPage] || { tiles: [] }

    // Page Navigation via Wheel
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) < 30) return // ignore small movements

            if (e.deltaY > 0) {
                if (currentPage < totalPages - 1) setPage(currentPage + 1)
            } else {
                if (currentPage > 0) setPage(currentPage - 1)
            }
        }

        const el = parentRef.current
        if (el) el.addEventListener('wheel', handleWheel)
        return () => {
            if (el) el.removeEventListener('wheel', handleWheel)
        }
    }, [currentPage, totalPages, setPage])

    // Keyboard Navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            // ArrowRight/Down -> Next Page
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                if (currentPage < totalPages - 1) setPage(currentPage + 1)
            }
            // ArrowLeft/Up -> Prev Page
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                if (currentPage > 0) setPage(currentPage - 1)
            }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [currentPage, totalPages, setPage])

    // Page Indicator Visibility
    const [isIndicatorVisible, setIndicatorVisible] = useState(false)
    useEffect(() => {
        setIndicatorVisible(true)
        const timer = setTimeout(() => setIndicatorVisible(false), 3000)
        return () => clearTimeout(timer)
    }, [currentPage])

    return (
        <div ref={parentRef} className="gallery-container" style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentPage}
                    initial={{ opacity: 0, scale: 0.98, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 1.02, x: -25 }}
                    transition={{ duration: 0.5, ease: "circOut" }}
                    style={{ width: '100%', height: '100%', position: 'relative' }}
                >
                    {currentLayout.tiles?.map(tile => (
                        <div
                            key={tile.data.id}
                            className="gallery-tile"
                            style={{
                                position: 'absolute',
                                left: tile.x,
                                top: tile.y,
                                width: tile.width,
                                height: tile.height,
                                transition: 'none' // disable CSS transition to let Framer handle page
                            }}
                            onClick={() => onImageClick(images.indexOf(tile.data))}
                        >
                            {['.mp4', '.webm', '.mov'].some(ext => tile.data.path.toLowerCase().endsWith(ext)) ? (
                                <video
                                    src={`thumb:///${tile.data.path.replace(/\\/g, '/')}`}
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                            ) : (
                                <img
                                    src={`thumb:///${tile.data.thumb_path?.replace(/\\/g, '/')}`}
                                    // Eager load current page
                                    loading="eager"
                                    alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                            )}
                        </div>
                    ))}
                </motion.div>
            </AnimatePresence>

            {totalPages > 1 && (
                <div className="page-indicator" style={{
                    position: 'absolute',
                    bottom: 20,
                    right: 20,
                    color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(0,0,0,0.6)',
                    padding: '8px 16px',
                    borderRadius: 20,
                    backdropFilter: 'blur(10px)',
                    fontSize: '14px',
                    fontWeight: 500,
                    pointerEvents: 'none',
                    zIndex: 100,
                    opacity: isIndicatorVisible ? 1 : 0,
                    transition: 'opacity 0.5s ease-in-out'
                }}>
                    Page {currentPage + 1} / {totalPages}
                </div>
            )}
        </div>
    )
}
