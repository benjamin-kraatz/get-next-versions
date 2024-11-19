export const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
} as const;

/**
 * Prints a section header and an optional content string to the console.
 *
 * @param title - The title string to print as the header.
 * @param content - Optional content string to print below the header.
 */
export function printSection(title: string, content: string = ""): void {
  console.log(`\n${colors.bright}${colors.blue}${title}${colors.reset}`);
  if (content) {
    console.log(content);
  }
}

/**
 * Checks if the given package name matches the given scope.
 *
 * This function returns true if the given package name matches the given
 * scope, and false otherwise.
 * The match is determined by the string-equality of the trimmed
 * and lowercased package name and the trimmed and lowercased scope.
 *
 * @param scope - The scope to check the package name against.
 * @param pkgName - The package name to check.
 * @returns True if the package name matches the scope, otherwise false.
 */
export function checkPackageInScope(scope: string, pkgName: string): boolean {
  return (
    pkgName.trim().toLocaleLowerCase() === scope.trim().toLocaleLowerCase()
  );
}
