import { readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { getRegisteredProjects } from './db'

export interface DiscoveredProject {
  slug: string
  name: string
  path: string
}

/**
 * Amplifier stores projects with slugs that are mangled filesystem paths.
 * e.g. slug "-Users-chrispark-Projects-amplifier-canvas"
 *   → original path "/Users/chrispark/Projects/amplifier-canvas"
 *
 * Reconstruct the original path and derive a human-readable name from
 * the last path component.
 */
function slugToOriginalPath(slug: string): string {
  // Replace leading dash with "/" and all other dashes-before-uppercase-or-path-boundary
  // The slug format is: dashes replace path separators.
  // "-Users-chrispark-Projects-foo" → "/Users/chrispark/Projects/foo"
  //
  // But some directory names contain dashes: "amplifier-canvas" → "amplifier-canvas"
  // We can't distinguish path-separator dashes from name dashes from the slug alone.
  // Instead, try the project dir's sessions/ to find a session with a workDir,
  // or fall back to treating the last few dash-segments as the name.
  //
  // Simplest reliable approach: the slug IS an entry in ~/.amplifier/projects/.
  // The actual path this project points to is reconstructable because Amplifier's
  // slug format is: replace "/" with "-" and drop the leading slash.
  // So "-Users-chrispark-Projects-amplifier-canvas" → "/Users/chrispark/Projects/amplifier-canvas"
  //
  // We reconstruct by: replace leading "-" with "/", then try progressively
  // joining segments with "/" from the left until we find an existing path.
  return '/' + slug.slice(1).replace(/-/g, '/')
}

/**
 * Given a mangled slug like "-Users-chrispark-Projects-amplifier-canvas",
 * find the real filesystem path it corresponds to. We walk from the root
 * trying to resolve actual directories, which handles names with dashes.
 */
function resolveSlugPath(slug: string): string | null {
  // Remove the leading dash and split on dashes
  const parts = slug.slice(1).split('-')

  let resolved = ''
  let i = 0

  while (i < parts.length) {
    // Try accumulating parts greedily (longest match first)
    // to handle directory names with dashes like "amplifier-canvas"
    let matched = false
    for (let end = parts.length; end > i; end--) {
      const candidate = resolved + '/' + parts.slice(i, end).join('-')
      if (existsSync(candidate)) {
        resolved = candidate
        i = end
        matched = true
        break
      }
    }
    if (!matched) {
      // No existing path found — fall back to simple reconstruction
      resolved = resolved + '/' + parts.slice(i).join('-')
      break
    }
  }

  return resolved || null
}

export function slugToName(slug: string): string {
  // Try to resolve the actual filesystem path to get the real directory name
  const resolvedPath = resolveSlugPath(slug)
  if (resolvedPath) {
    return prettifyDirName(basename(resolvedPath))
  }

  // Fallback: try simple path reconstruction
  const simplePath = slugToOriginalPath(slug)
  return prettifyDirName(basename(simplePath))
}

/**
 * Convert a directory name to a human-friendly display name.
 * "amplifier-canvas" → "Amplifier Canvas"
 * "ridecast2" → "Ridecast2"
 */
function prettifyDirName(dirName: string): string {
  return dirName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Scans amplifierHome/projects/ on-demand and returns projects that are NOT
 * yet registered in Canvas. Does NOT write to the database — read-only.
 *
 * Only returns projects that have at least one session (to filter junk).
 * Shows the human-readable project name derived from the original filesystem path.
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
      .filter((entry) => {
        // Only include projects with at least one session
        const sessionsDir = join(projectsDir, entry.name, 'sessions')
        if (!existsSync(sessionsDir)) return false
        try {
          const sessions = readdirSync(sessionsDir, { withFileTypes: true }).filter((s) => s.isDirectory())
          return sessions.length > 0
        } catch {
          return false
        }
      })
      .map((entry) => {
        const resolvedPath = resolveSlugPath(entry.name)
        return {
          slug: entry.name,
          name: slugToName(entry.name),
          path: resolvedPath || join(projectsDir, entry.name),
        }
      })
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
