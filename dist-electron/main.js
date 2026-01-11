import { app, protocol, BrowserWindow, ipcMain, dialog } from "electron";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, stat } from "node:fs/promises";
import sharp from "sharp";
import exifr from "exifr";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
let db = null;
function getDb() {
  if (db) return db;
  const userDataPath = app.getPath("userData");
  const dbPath = join(userDataPath, "library.db");
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}
function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      width INTEGER,
      height INTEGER,
      mtime INTEGER,
      thumb_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_path ON images(path);
  `);
}
function insertImage(path, width, height, mtime, thumbPath) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO images (path, width, height, mtime, thumb_path)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      width = excluded.width,
      height = excluded.height,
      mtime = excluded.mtime,
      thumb_path = excluded.thumb_path
  `);
  return stmt.run(path, width, height, mtime, thumbPath);
}
function getAllImages() {
  const database = getDb();
  return database.prepare("SELECT * FROM images ORDER BY mtime DESC").all();
}
function clearLibrary() {
  const database = getDb();
  database.prepare("DELETE FROM images").run();
}
const VALID_EXTENSIONS = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".avif"]);
async function scanDirectory(dirPath, onProgress, onBatchFound) {
  const imagesToProcess = [];
  async function traverse(currentDir) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".")) {
            await traverse(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (VALID_EXTENSIONS.has(ext)) {
            try {
              const s = await stat(fullPath);
              imagesToProcess.push({ path: fullPath, time: s.mtimeMs });
            } catch {
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning ${currentDir}:`, err);
    }
  }
  await traverse(dirPath);
  imagesToProcess.sort((a, b) => b.time - a.time);
  const thumbBaseDir = join(app.getPath("userData"), "thumbnails");
  await mkdir(thumbBaseDir, { recursive: true });
  let count = 0;
  const total = imagesToProcess.length;
  console.log(`Found ${total} images. Processing...`);
  const CONCURRENCY = 5;
  const queue = [...imagesToProcess];
  let batch = [];
  const BATCH_SIZE = 50;
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const imgPath = item.path;
      try {
        const imgData = await processImage(imgPath, thumbBaseDir);
        if (imgData) {
          batch.push(imgData);
          if (batch.length >= BATCH_SIZE) {
            const chunk = [...batch];
            batch = [];
            if (onBatchFound) onBatchFound(chunk);
          }
        }
      } catch (err) {
        console.error(`Failed to process ${imgPath}:`, err);
      } finally {
        count++;
        if (onProgress) onProgress(count, total);
      }
    }
  }
  const workers = Array(CONCURRENCY).fill(null).map(() => worker());
  await Promise.all(workers);
  if (batch.length > 0 && onBatchFound) {
    onBatchFound(batch);
  }
  return total;
}
async function processImage(filePath, thumbBaseDir) {
  const fileStats = await stat(filePath);
  const mtime = fileStats.mtimeMs;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(filePath).metadata();
    width = meta.width || 0;
    height = meta.height || 0;
    if ((meta.orientation || 0) >= 5) [width, height] = [height, width];
  } catch (e) {
    try {
      const meta = await exifr.parse(filePath, { pick: ["ImageWidth", "ImageHeight", "Orientation"] });
      width = meta?.ImageWidth || 0;
      height = meta?.ImageHeight || 0;
      if (meta?.Orientation >= 5) [width, height] = [height, width];
    } catch (e2) {
    }
  }
  if (width === 0 || height === 0) return null;
  const thumbName = `${randomUUID()}.webp`;
  const thumbPath = join(thumbBaseDir, thumbName);
  await sharp(filePath).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).toFormat("webp", { quality: 80 }).toFile(thumbPath);
  insertImage(filePath, width, height, mtime, thumbPath);
  return {
    path: filePath,
    width,
    height,
    mtime,
    thumb_path: thumbPath,
    id: -1
    // ID is unknown until DB insert, but we can assume ID is not critical for layout if key is path/thumb
    // Actually Store usually uses ID as key. DB insert returns info?
    // insertImage is synchronous? 
    // We better verify insertImage returns ID or we re-fetch?
    // For Speed, we can just use random ID or ignore ID for display.
    // Let's modify DB to return ID or just mock it? 
    // Actually, let's just use path/thumb as unique key in frontend for now.
  };
}
const __dirname$1 = fileURLToPath(new URL(".", import.meta.url));
protocol.registerSchemesAsPrivileged([
  { scheme: "thumb", privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
]);
process.env.APP_ROOT = join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: join(process.env.VITE_PUBLIC, "icon.png"),
    // efficient
    webPreferences: {
      preload: join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
      // Allow loading local files directly
    }
  });
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    console.log("🔹 Loading URL:", VITE_DEV_SERVER_URL);
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    console.log("🔸 VITE_DEV_SERVER_URL is not defined, loading file:", join(RENDERER_DIST, "index.html"));
    win.loadFile(join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  ipcMain.handle("dialog:openDirectory", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"]
    });
    if (canceled) return null;
    return filePaths[0];
  });
  ipcMain.handle("library:scan", async (_event, dirPath) => {
    const total = await scanDirectory(
      dirPath,
      (scanned, total2) => {
        win?.webContents.send("scan:progress", { scanned, total: total2 });
      },
      (batch) => {
        win?.webContents.send("library:incremental", batch);
      }
    );
    return total;
  });
  ipcMain.handle("library:getImages", () => {
    return getAllImages();
  });
  ipcMain.handle("library:clear", () => {
    return clearLibrary();
  });
  protocol.registerFileProtocol("thumb", (request, callback) => {
    const url = request.url.replace(/^thumb:\/\//, "");
    const decodedUrl = decodeURI(url);
    let filePath = decodedUrl;
    if (process.platform === "win32" && filePath.match(/^\/[a-zA-Z]:/)) {
      filePath = filePath.slice(1);
    }
    callback({ path: filePath });
  });
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
