import { getLastTag } from "./commits.js";
import { VersionChanges } from "./types.js";

/**
 * Returns the current version of the package.
 * The current version is determined by the last tag with the given prefix.
 *
 * If the given prefix is not found in any tags, the function returns "0.0.0".
 *
 * @param prefix - The tag prefix to search for (e.g. "app-v").
 */
export function getCurrentVersion(prefix: string): string {
  const lastTag = getLastTag(prefix);
  if (!lastTag) return "0.0.0";
  return lastTag.replace(prefix, "");
}

/**
 * Determines the version change for a given list of commits.
 *
 * This function analyzes commit messages and returns a VersionChanges object
 * indicating whether the commits contain breaking changes, new features, or fixes.
 *
 * Version change rules:
 *   - Major version bump:
 *     - "BREAKING CHANGE" appears anywhere in the commit message
 *     - Commit type (feat or fix) has an exclamation mark (!) at the end
 *       (e.g., "feat!:" or "feat(scope)!:")
 *   - Minor version bump: Commit message starts with "feat"
 *   - Patch version bump: Commit message starts with "fix"
 *
 * @param commits - The list of commit messages to analyze.
 * @returns A VersionChanges object indicating the version changes.
 */
export function determineVersionChange(commits: string[]): VersionChanges {
  const changes: VersionChanges = {
    major: false,
    minor: false,
    patch: false,
  };

  const breakingChangeRegex = /^(feat|fix)(\([^)]+\))?!:/;
  for (const commit of commits) {
    const message = commit.toLowerCase();
    if (
      message.includes("breaking change") ||
      breakingChangeRegex.test(message)
    ) {
      changes.major = true;
    } else if (message.startsWith("feat")) {
      changes.minor = true;
    } else if (message.startsWith("fix")) {
      changes.patch = true;
    }
  }

  return changes;
}

/**
 * Calculates the next version based on the given version changes.
 *
 * If the given VersionChanges object indicates a major version change,
 * the major version is incremented and the minor and patch versions are
 * reset to 0.
 *
 * If the given VersionChanges object indicates a minor version change,
 * the minor version is incremented and the patch version is reset to 0.
 *
 * If the given VersionChanges object indicates a patch version change,
 * the patch version is incremented.
 *
 * If the given VersionChanges object does not indicate any version changes,
 * the current version is returned unchanged.
 *
 * @param currentVersion - The current version (e.g., "1.2.3").
 * @param changes - The version changes to apply.
 * @returns The next version (e.g., "1.2.4").
 */
export function createVersion(
  currentVersion: string,
  changes: VersionChanges,
): string {
  const [major, minor, patch] = currentVersion.split(".").map(Number);

  if (changes.major) {
    return `${major + 1}.0.0`;
  }

  if (changes.minor) {
    return `${major}.${minor + 1}.0`;
  }

  if (changes.patch) {
    return `${major}.${minor}.${patch + 1}`;
  }

  return currentVersion;
}
