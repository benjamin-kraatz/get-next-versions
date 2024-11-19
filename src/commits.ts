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
