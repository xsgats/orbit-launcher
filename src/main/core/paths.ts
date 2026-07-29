import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'





class Paths {
  private root: string

  constructor() {

    this.root = process.env.ORBIT_DATA_ROOT?.trim() || join(app.getPath('appData'), 'OrbitLauncher')
  }

  setRoot(next: string): void {
    this.root = next
    this.ensure()
  }

  get dataRoot(): string {
    return this.root
  }


  get configRoot(): string {
    return app.getPath('userData')
  }

  get settingsFile(): string {
    return join(this.configRoot, 'settings.json')
  }

  get accountsFile(): string {
    return join(this.configRoot, 'accounts.json')
  }

  get notificationsFile(): string {
    return join(this.configRoot, 'notifications.json')
  }

  get javaIndexFile(): string {
    return join(this.configRoot, 'java.json')
  }

  get instancesDir(): string {
    return join(this.root, 'instances')
  }

  get sharedDir(): string {
    return join(this.root, 'shared')
  }

  get versionsDir(): string {
    return join(this.sharedDir, 'versions')
  }

  get librariesDir(): string {
    return join(this.sharedDir, 'libraries')
  }

  get assetsDir(): string {
    return join(this.sharedDir, 'assets')
  }

  get assetObjectsDir(): string {
    return join(this.assetsDir, 'objects')
  }

  get assetIndexesDir(): string {
    return join(this.assetsDir, 'indexes')
  }

  get nativesDir(): string {
    return join(this.sharedDir, 'natives')
  }

  get javaDir(): string {
    return join(this.root, 'java')
  }

  get cacheDir(): string {
    return join(this.root, 'cache')
  }

  get metaCacheDir(): string {
    return join(this.cacheDir, 'meta')
  }

  get iconCacheDir(): string {
    return join(this.cacheDir, 'icons')
  }

  get downloadsCacheDir(): string {
    return join(this.cacheDir, 'downloads')
  }

  get backupsDir(): string {
    return join(this.root, 'backups')
  }

  get logsDir(): string {
    return join(this.root, 'logs')
  }

  get launcherLogFile(): string {
    return join(this.logsDir, 'orbit.log')
  }

  instanceDir(folder: string): string {
    return join(this.instancesDir, folder)
  }


  instanceMetaDir(folder: string): string {
    return join(this.instanceDir(folder), '.orbit')
  }

  instanceConfigFile(folder: string): string {
    return join(this.instanceMetaDir(folder), 'instance.json')
  }


  instanceGameDir(folder: string): string {
    return join(this.instanceDir(folder), 'minecraft')
  }

  instanceBackupsDir(folder: string): string {
    return join(this.backupsDir, folder)
  }

  ensure(): void {
    for (const dir of [
      this.configRoot,
      this.root,
      this.instancesDir,
      this.sharedDir,
      this.versionsDir,
      this.librariesDir,
      this.assetsDir,
      this.assetObjectsDir,
      this.assetIndexesDir,
      this.nativesDir,
      this.javaDir,
      this.cacheDir,
      this.metaCacheDir,
      this.iconCacheDir,
      this.downloadsCacheDir,
      this.backupsDir,
      this.logsDir
    ]) {
      try {
        mkdirSync(dir, { recursive: true })
      } catch {

      }
    }
  }
}

export const paths = new Paths()
