import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanDirectory } from './scanner'
import { getAllImages, clearLibrary } from './db'

// ... (imports)

// ... (setup)


// import { setupHandlers } from './ipc-handlers' // Will implement later

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Register custom protocol as privileged
protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
])
process.env.APP_ROOT = join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = join(process.env.APP_ROOT!, 'dist-electron')
export const RENDERER_DIST = join(process.env.APP_ROOT!, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? join(process.env.APP_ROOT!, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: join(process.env.VITE_PUBLIC!, 'icon.png'), // efficient
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Allow loading local files directly
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    console.log('🔹 Loading URL:', VITE_DEV_SERVER_URL)
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    console.log('🔸 VITE_DEV_SERVER_URL is not defined, loading file:', join(RENDERER_DIST, 'index.html'))
    // win.loadFile('dist/index.html')
    win.loadFile(join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // IPC Handlers
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (canceled) return null
    return filePaths[0]
  })

  ipcMain.handle('library:scan', async (_event, dirPath) => {
    const total = await scanDirectory(
      dirPath,
      (scanned, total) => {
        win?.webContents.send('scan:progress', { scanned, total })
      },
      (batch) => {
        // Send incremental batch to frontend
        win?.webContents.send('library:incremental', batch)
      }
    )
    return total
  })

  ipcMain.handle('library:getImages', () => {
    return getAllImages()
  })

  ipcMain.handle('library:clear', () => {
    return clearLibrary()
  })

  // Protocol for serving thumbnails
  // Protocol for serving thumbnails
  protocol.registerFileProtocol('thumb', (request, callback) => {
    const url = request.url.replace(/^thumb:\/\//, '')
    const decodedUrl = decodeURI(url)

    // Handle Windows paths: /C:/Users... -> C:/Users...
    let filePath = decodedUrl
    if (process.platform === 'win32' && filePath.match(/^\/[a-zA-Z]:/)) {
      filePath = filePath.slice(1)
    }

    // console.log('🖼️ Serving thumbnail (Legacy):', filePath)
    callback({ path: filePath })
  })

  createWindow()
})
