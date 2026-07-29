import type { LoaderType, LoaderVersion } from '../../../shared/types'
import { getManifest } from '../minecraft/versions'
import type { TaskHandle } from '../tasks'
import * as fabric from './fabric'
import * as forge from './forge'

/** Every Minecraft version a given loader can be installed on. */
export async function loaderSupportedMinecraft(loader: LoaderType): Promise<string[]> {
  switch (loader) {
    case 'vanilla':
      return (await getManifest()).map((v) => v.id)
    case 'fabric':
    case 'quilt':
      return fabric.listSupportedMinecraft(loader)
    case 'forge':
      return forge.listSupportedMinecraft('forge')
    case 'neoforge':
      return forge.listSupportedMinecraft('neoforge')
  }
}

export async function loaderVersions(loader: LoaderType, minecraftVersion: string): Promise<LoaderVersion[]> {
  switch (loader) {
    case 'vanilla':
      return []
    case 'fabric':
    case 'quilt':
      return fabric.listLoaderVersions(loader, minecraftVersion)
    case 'forge':
      return forge.listLoaderVersions('forge', minecraftVersion)
    case 'neoforge':
      return forge.listLoaderVersions('neoforge', minecraftVersion)
  }
}

export async function latestLoaderVersion(loader: LoaderType, minecraftVersion: string): Promise<string | null> {
  switch (loader) {
    case 'vanilla':
      return null
    case 'fabric':
    case 'quilt':
      return fabric.latestLoaderVersion(loader, minecraftVersion)
    case 'forge':
      return forge.latestLoaderVersion('forge', minecraftVersion)
    case 'neoforge':
      return forge.latestLoaderVersion('neoforge', minecraftVersion)
  }
}

/**
 * Installs the loader profile and returns the version id that should actually
 * be launched. For vanilla that is simply the Minecraft version.
 */
export async function installLoader(
  loader: LoaderType,
  minecraftVersion: string,
  loaderVersion: string | null,
  task?: TaskHandle
): Promise<string> {
  if (loader === 'vanilla') return minecraftVersion

  const version = loaderVersion ?? (await latestLoaderVersion(loader, minecraftVersion))
  if (!version) throw new Error(`Could not determine a ${loader} version for Minecraft ${minecraftVersion}.`)

  switch (loader) {
    case 'fabric':
    case 'quilt':
      return fabric.installFabricLike(loader, minecraftVersion, version, task)
    case 'forge':
      return forge.installForgeLike('forge', minecraftVersion, version, task)
    case 'neoforge':
      return forge.installForgeLike('neoforge', minecraftVersion, version, task)
  }
}

/** Human-friendly loader version for display (Forge embeds the game version). */
export function displayLoaderVersion(
  loader: LoaderType,
  minecraftVersion: string,
  loaderVersion: string | null
): string {
  if (!loaderVersion) return ''
  if (loader === 'forge' || loader === 'neoforge') {
    return forge.shortForgeVersion(minecraftVersion, loaderVersion)
  }
  return loaderVersion
}

export { neoforgeMinecraftVersion } from './forge'
