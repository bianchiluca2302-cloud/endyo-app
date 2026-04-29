const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')

let mainWindow
let pythonProcess

// isDev = true solo se viene passato esplicitamente il flag "--dev"
// (usato da "npm run dev:electron"). "npm start" non lo passa → modalità produzione.
const isDev = process.argv.includes('--dev')

function findPython(backendPath) {
  // Try venv first, then system Python
  const venvPythons = [
    path.join(backendPath, 'venv', 'bin', 'python3'),
    path.join(backendPath, 'venv', 'bin', 'python'),
    path.join(backendPath, 'venv', 'Scripts', 'python.exe'),
  ]
  for (const p of venvPythons) {
    if (fs.existsSync(p)) return p
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

function startPythonBackend() {
  const backendPath = path.join(__dirname, 'backend')
  if (!fs.existsSync(backendPath)) {
    console.error('[Backend] backend/ directory not found')
    return
  }

  const pythonCmd = findPython(backendPath)
  console.log(`[Backend] Using Python: ${pythonCmd}`)

  pythonProcess = spawn(
    pythonCmd,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: backendPath,
      // PYTHONIOENCODING=utf-8 evita crash su Windows con emoji nelle print()
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  pythonProcess.stdout.on('data', (d) => console.log(`[Backend] ${d.toString().trim()}`))
  pythonProcess.stderr.on('data', (d) => console.error(`[Backend] ${d.toString().trim()}`))
  pythonProcess.on('error', (err) => console.error(`[Backend] Failed to start: ${err.message}`))
  pythonProcess.on('close', (code) => console.log(`[Backend] Exited with code ${code}`))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Endyo',
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 780,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0d14',
    icon: fs.existsSync(path.join(__dirname, 'assets', 'icon.png'))
      ? path.join(__dirname, 'assets', 'icon.png')
      : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // DevTools solo su Ctrl+Shift+I / Cmd+Option+I — NON automaticamente
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isMac = process.platform === 'darwin'
      const key = input.key === 'i' || input.key === 'I'
      const mod = isMac ? input.meta && input.alt : input.control && input.shift
      if (key && mod) {
        mainWindow.webContents.toggleDevTools()
      }
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)  // Rimuove la barra menu (File, Edit, View…)

  // Consenti geolocalizzazione (necessario in Electron — browser la nega di default)
  const { session } = require('electron')
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'geolocation') return callback(true)
    callback(false)
  })

  startPythonBackend()
  // Aspetta 2s che il backend si avvii prima di mostrare la UI
  setTimeout(createWindow, 2000)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (pythonProcess) pythonProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (pythonProcess) pythonProcess.kill()
})
