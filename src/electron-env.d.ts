export interface ElectronAPI {
    ipcRenderer: {
        invoke(channel: 'dialog:openDirectory'): Promise<string | null>
        invoke(channel: 'library:scan', path: string): Promise<number>
        invoke(channel: 'library:getImages'): Promise<Array<{
            id: number
            path: string
            width: number
            height: number
            mtime: number
            thumb_path: string
        }>>
        on(channel: 'scan:progress', listener: (event: any, data: { scanned: number, total: number }) => void): void
        off(channel: 'scan:progress', listener: (...args: any[]) => void): void
    }
}

declare global {
    interface Window {
        ipcRenderer: ElectronAPI['ipcRenderer']
    }
}
