import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ImageItem } from '../types'
import './lightbox.scss'

interface LightboxProps {
    images: ImageItem[]
    initialIndex: number
    onClose: () => void
}

export function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
    const [index, setIndex] = useState(initialIndex)
    const currentImage = images[index]
    const [direction, setDirection] = useState(0)

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowLeft') {
                setDirection(-1)
                setIndex(i => Math.max(0, i - 1))
            }
            if (e.key === 'ArrowRight') {
                setDirection(1)
                setIndex(i => Math.min(images.length - 1, i + 1))
            }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [images.length, onClose])

    if (!currentImage) return null

    const ext = currentImage.path.split('.').pop()?.toLowerCase()
    const isVideo = ['mp4', 'webm', 'mov'].includes(ext || '')

    return (
        <AnimatePresence>
            <motion.div
                className="lightbox-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <div className="lightbox-content">
                    <AnimatePresence initial={false} custom={direction} mode="wait">
                        <motion.div
                            key={currentImage.id}
                            custom={direction}
                            initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="media-wrapper"
                            style={{ display: 'flex', justifyContent: 'center', width: '100%', height: '100%' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {isVideo ? (
                                <video
                                    src={`thumb:///${currentImage.path.replace(/\\/g, '/')}`}
                                    controls
                                    autoPlay
                                    className="media-content"
                                />
                            ) : (
                                <img
                                    src={`thumb:///${currentImage.path.replace(/\\/g, '/')}`}
                                    alt=""
                                    className="media-content"
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>

                    <button className="close-btn" onClick={onClose}>×</button>

                    <div className="info-bar">
                        <span>{currentImage.path}</span>
                    </div>

                    <div className="nav-btn prev" onClick={(e) => {
                        e.stopPropagation(); setDirection(-1); setIndex(i => Math.max(0, i - 1))
                    }}>‹</div>

                    <div className="nav-btn next" onClick={(e) => {
                        e.stopPropagation(); setDirection(1); setIndex(i => Math.min(images.length - 1, i + 1))
                    }}>›</div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
