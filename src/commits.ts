import { execSync } from "node:child_process";
import { colors } from "./helpers.js";

/**
 * Formats a commit message by coloring the hash and appending the message.
 * The hash is truncated to the first 7 characters and colored yellow.
 *
 * @param hash - The full hash of the commit.
 * @param message - The commit message.
 * @returns The formatted commit string with a colored hash.
 */
export function formatCommit(hash: string, message: string): string {
  return `${colors.yellow}${hash.slice(0, 7)}${colors.reset} ${message}`;
}

/**
 * Finds the last tag with the given prefix in the current branch.
 *
 * Returns `undefined` if no tag matches the prefix.
 *
 * @param prefix - The tag prefix to search for.
 * @returns The last tag with the given prefix, if found.
 */
export function getLastTag(prefix: string): string | undefined {
  try {
    // For root packages with just 'v', we need to be more careful about the match pattern
    const matchPattern = prefix === "v" ? "v[0-9]*" : `${prefix}*`;
    // Redirect stderr to /dev/null to suppress "fatal: No names found" message
    return runCommand(
      `git describe --tags --match "${matchPattern}" --abbrev=0 2>/dev/null`,
    );
  } catch {
    return undefined;
  }
}

/**
 * Calculates the commit range for a given package.
 *
 * If a tag with the given prefix exists, the range is from that tag to HEAD.
 * Otherwise, the range is just HEAD, meaning all commits will be considered.
 *
 * If a limit is provided, it will be appended to the range.
 * This results in a range like "tag..HEAD~limit", where "tag" is the last tag
 * with the given prefix in the current branch, and "limit" is the number of
 * commits to limit the range to.
 *
 * @param prefix - The tag prefix to search for.
 * @param limit - The number of commits to limit the range to.
 * @returns The commit range to analyze, either a specific range or just HEAD.
 */
export function getCommitRange(prefix: string, limit?: number): string {
  const lastTag = getLastTag(prefix);
  const until = lastTag ? `${lastTag}..HEAD` : "HEAD";
  return until + (limit ? `~${limit}` : "");
}

/**
 * Runs a command and returns the result as a string.
 *
 * Returns `undefined` if the command fails or produces no output.
 *
 * @param command - The command to run.
 * @returns The output of the command as a string, if successful.
 */
function runCommand(command: string): string | undefined {
  try {
    return execSync(command).toString().trim();
  } catch {
    return undefined;
  }
}
