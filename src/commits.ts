import { execSync } from "node:child_process";
import { colors } from "./helpers.js";
import { CommitMessage } from "./types.js";

/**
 * Retrieves all commits since the given tag.
 *
 * This function fetches commits using `git log` with a commit range determined by `getCommitRange`.
 * It parses the output to create an array of `CommitMessage` objects.
 *
 * @param tag - The tag prefix to use as the starting point for the commit range.
 * @returns An array of `CommitMessage` objects, each containing a commit hash and message.
 *          Returns an empty array if no commits are found or if an error occurs.
 */
export function getCommitsForTag(tag: string): CommitMessage[] {
  const commitRange = getCommitRange(tag);
  return getCommits(commitRange)
    .map((line) => {
      const [hash, ...messageParts] = line.split(" ");
      return { hash: hash.trim(), message: messageParts.join(" ").trim() };
    })
    .filter((c) => c.hash && c.message);
}

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
 * Retrieves the timestamp and commit hash for a given tag.
 *
 * @param tag - The tag to retrieve information for.
 * @returns An object with the timestamp and commit hash, or `undefined` if the tag does not exist.
 */
export function getTagInfos(tag: string):
  | {
      timestamp: number;
      commitHash: string;
    }
  | undefined {
  try {
    const result = runCommand(`git show -s --format=%ct:%h ${tag}`);
    if (!result) return undefined;
    const [timestamp, commitHash] = result.split(":");
    return {
      timestamp: Number(timestamp),
      commitHash,
    };
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
  const limitUse = limit && limit > 0 && limit < 1_000 ? limit : undefined;
  const lastTag = getLastTag(prefix);
  const until = lastTag ? `${lastTag}..HEAD` : "HEAD";
  return until + (limitUse ? `~${limitUse}` : "");
}

/**
 * Parses a commit message into a structured object.
 *
 * The input message must conform to the following format:
 *   - A single word for the type (e.g. "feat", "fix", "docs")
 *   - Optional: a scope in parentheses (e.g. "feat(api):")
 *   - Optional: an exclamation mark at the end to indicate a breaking change
 *     (e.g. "feat!:", "feat(api)!:")
 *
 * If the input message does not match this format, the function returns `undefined`.
 *
 * @param message - The commit message to parse.
 * @returns An object with the parsed properties, or `undefined` if the message does not match the format.
 */
export function parseCommitInfo(message: string):
  | {
      type: string;
      scope: string;
      breaking: boolean;
    }
  | undefined {
  const match = message.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:/);
  if (!match) {
    return undefined;
  }

  const [, type, scopeMatch, breakingMatch] = match;
  const scope = scopeMatch || "";
  return {
    type,
    scope,
    breaking: !!breakingMatch,
  };
}

export function getChangedFilesInCommit(commitHash: string): string[] {
  return (
    runCommand(
      `git diff-tree --no-commit-id --name-only -r ${commitHash}`,
    )?.split("\n") ?? []
  );
}

/**
 * Creates a new git tag with the given name.
 *
 * @param tag - The name of the tag to create.
 * @param publish - If true, the tag will be pushed to the origin repository
 * after creation.
 */
export function createTag(tag: string, publish: boolean = true): void {
  runCommand(`git tag ${tag}`);
  if (publish) {
    runCommand(`git push origin ${tag}`);
  }
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

/**
 * Retrieves a list of commits within a given range.
 *
 * The commits are fetched using `git log`, and the commit range is passed
 * as an argument. The range can be a specific commit hash, a range of hashes
 * like "tag..HEAD", or a limit like "HEAD~100".
 *
 * The commits are returned as an array of strings, where each string is in the
 * format "hash message". The hash is the full hash of the commit, and the message
 * is the commit message.
 *
 * If an error occurs while fetching the commits, an empty array is returned.
 *
 * @param commitRange - The range of commits to fetch.
 * @returns An array of commits, or an empty array if an error occurs.
 */
function getCommits(commitRange: string): string[] {
  try {
    const commitsRaw = runCommand(`git log ${commitRange} --format="%H %s"`);
    if (!commitsRaw) {
      return [];
    }
    return commitsRaw.toString().trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
