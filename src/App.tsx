import { useState, useEffect } from 'react'
import { useGalleryStore } from './store'
import { GalleryCanvas } from './gallery/GalleryCanvas'
import { Lightbox } from './gallery/Lightbox'
import './app.scss'

function App() {
    const {
        images,
        scanLibrary,
        isScanning,
        scanProgress,
        refreshLibrary,
        rootPath
    } = useGalleryStore()

    const [tileSize, setTileSize] = useState(250)
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

    useEffect(() => {
        if (window.ipcRenderer) {
            const removeListener = window.ipcRenderer.on('scan:progress', (_event: any, data) => {
                useGalleryStore.setState({ scanProgress: data })
            })
            // return removeListener // depends on implementation, safer to ignore for now if uncertain
        }
    }, [])

    const handleOpenFolder = async () => {
        if (!window.ipcRenderer) return
        const path = await window.ipcRenderer.invoke('dialog:openDirectory')
        if (path) {
            await scanLibrary(path)
        }
    }

    const [showControls, setShowControls] = useState(false)

    return (
        <div className="app-container">
            {/* Main Content (Now Full Screen) */}
            <main
                className="main-content"
                onMouseEnter={() => setShowControls(false)}
            >
                {images.length === 0 ? (
                    <div className="empty-state">
                        <div className="icon">🖼️</div>
                        <p>Open a folder to get started</p>
                        <button onClick={handleOpenFolder} className="btn-large">
                            Pick Folder
                        </button>
                    </div>
                ) : (
                    <div className="gallery-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
                        <GalleryCanvas
                            images={images}
                            tileSize={tileSize}
                            onImageClick={(index) => setLightboxIndex(index)}
                        />
                    </div>
                )}
            </main>

            {/* Floating Bottom Pill - Hidden by default, reveal on hover of the bottom area */}
            <div
                className="bottom-interaction-zone"
                onMouseEnter={() => setShowControls(true)}
                onMouseLeave={() => setShowControls(false)}
            >
                <div className={`bottom-pill ${showControls ? 'visible' : ''}`}>
                    <div className="pill-left">
                        <span className="app-title-small">Better Gallery</span>
                        <div className="divider" />

                        <button
                            onClick={handleOpenFolder}
                            className="btn-pill"
                            disabled={isScanning}
                        >
                            {isScanning ? 'Scanning...' : rootPath ? 'Change Folder' : 'Open'}
                        </button>

                        {rootPath && (
                            <span className="pill-path" title={rootPath}>
                                {rootPath.slice(-30).padStart(33, '...')}
                            </span>
                        )}
                    </div>

                    <div className="pill-right">
                        <span className="label">Zoom</span>
                        <input
                            type="range"
                            min="100"
                            max="600"
                            value={tileSize}
                            onChange={(e) => setTileSize(Number(e.target.value))}
                            className="zoom-slider"
                        />
                    </div>
                </div>
            </div>

            {lightboxIndex !== null && (
                <Lightbox
                    images={images}
                    initialIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </div>
    )
}

export default App
