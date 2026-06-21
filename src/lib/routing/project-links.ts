/**
 * Canonical hrefs for project / entity / task links.
 *
 * The app addresses these by human-readable slug, not UUID:
 *   project           → /projects/<project-slug>
 *   entity            → /projects/<project-slug>/<entity-slug>
 *   task (in context) → /projects/<project-slug>/<entity-slug>/<task-slug>
 *   task (flat)       → /tasks/<task-slug>     (deep-link fallback)
 *
 * The legacy /ops/projects/<id> UUID routes have been removed — all project
 * links now address the canonical /projects/<slug> URL directly.
 */
export function projectHref(projectSlug: string): string {
  return `/projects/${projectSlug}`;
}

export function entityHref(projectSlug: string, entitySlug: string): string {
  return `/projects/${projectSlug}/${entitySlug}`;
}

export function taskHref(projectSlug: string, entitySlug: string, taskSlug: string): string {
  return `/projects/${projectSlug}/${entitySlug}/${taskSlug}`;
}

/** Flat deep-link for a task when project/entity context isn't handy. */
export function taskFlatHref(taskSlug: string): string {
  return `/tasks/${taskSlug}`;
}
