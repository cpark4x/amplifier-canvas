import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getRegisteredProjects } from './db'

export interface DiscoveredProject {
  slug: string
  name: string
  path: string
}

/**
 * Scans amplifierHome/projects/ on-demand and returns projects that are NOT
 * yet registered in Canvas. Does NOT write to the database — read-only.
 */
export function discoverProjects(amplifierHome: string): DiscoveredProject[] {
  const projectsDir = join(amplifierHome, 'projects')

  if (!existsSync(projectsDir)) {
    return []
  }

  try {
    const registeredSlugs = new Set(
      getRegisteredProjects().map((p) => p.slug),
    )

    const entries = readdirSync(projectsDir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    )

    return entries
      .map((entry) => ({
        slug: entry.name,
        name: slugToName(entry.name),
        path: join(projectsDir, entry.name),
      }))
      .filter((project) => !registeredSlugs.has(project.slug))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error(
      '[discovery] Failed to scan projects directory:',
      err instanceof Error ? err.message : String(err),
    )
    return []
  }
}

export function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
