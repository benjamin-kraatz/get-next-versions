import { execSync } from "child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CommitInfo,
  Config,
  Package,
  VersionChanges,
  VersionUpdate,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
const CONFIG_PATH = resolve(process.cwd(), "release-config.json");
let config: Config | undefined;

// Add color support
const colors = {
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

function formatCommit(hash: string, message: string): string {
  return `${colors.yellow}${hash.slice(0, 7)}${colors.reset} ${message}`;
}

function printSection(title: string, content: string = ""): void {
  console.log(`\n${colors.bright}${colors.blue}${title}${colors.reset}`);
  if (content) {
    console.log(content);
  }
}

function getLastTag(prefix: string): string {
  try {
    // For root packages with just 'v', we need to be more careful about the match pattern
    const matchPattern = prefix === "v" ? "v[0-9]*" : `${prefix}*`;
    // Redirect stderr to /dev/null to suppress "fatal: No names found" message
    return execSync(
      `git describe --tags --match "${matchPattern}" --abbrev=0 2>/dev/null`,
    )
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function getCommitRange(prefix: string): string {
  const lastTag = getLastTag(prefix);
  return lastTag ? `${lastTag}..HEAD` : "HEAD";
}

function getCurrentVersion(prefix: string): string {
  const lastTag = getLastTag(prefix);
  if (!lastTag) return "0.0.0";
  return lastTag.replace(prefix, "");
}

function determineVersionChange(commits: string[]): VersionChanges {
  const changes: VersionChanges = {
    major: false,
    minor: false,
    patch: false,
  };

  for (const commit of commits) {
    const message = commit.toLowerCase();
    if (
      message.startsWith("breaking") ||
      message.includes("breaking change") ||
      message.includes("breaking-change")
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

function getNextVersion(
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

function checkPackageInScope(scope: string, pkgName: string): boolean {
  return pkgName.trim() === scope.trim();
}

// Initialize maps to store changes and version updates
const packageChanges = new Map<Package, CommitInfo[]>();
const versionUpdates = new Map<Package, VersionUpdate>();
let jsonOutput = false;

// Function to check versions
export function checkVersions(isCI: boolean = false): void {
  const args = process.argv.slice(2);
  jsonOutput = args.includes("--json");

  packageChanges.clear();
  versionUpdates.clear();

  const configFile = existsSync(CONFIG_PATH)
    ? CONFIG_PATH
    : resolve(__dirname, "../release-config.json");
  try {
    config = JSON.parse(readFileSync(configFile, "utf8")) as Config;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    if (isCI) {
      console.error(`Error parsing config file: ${errMsg}`);
      process.exit(1);
      return;
    }
    console.error(
      `${colors.red}⛔️ ${colors.bright}Error: Failed to parse config file.\nCheck out https://github.com/benjamin-kraatz/get-next-versions?tab=readme-ov-file#configuration for more details:\n${colors.reset}\n${colors.red}${errMsg}${colors.reset}`,
    );
    process.exit(1);
  }

  // are the any packges defined?
  if (config.versionedPackages.length === 0) {
    if (!jsonOutput) {
      console.error(
        `${colors.red}⛔️ ${colors.bright}Error: No packages defined in config file.${colors.reset}`,
      );
    }
    process.exit(1);
  }

  // Process each package
  for (const versionedPackage of config.versionedPackages) {
    const packagePrefix = versionedPackage.tagPrefix;
    const prefix = packagePrefix || "v";
    if (!jsonOutput && !packagePrefix) {
      console.warn(
        `${colors.yellow}⚠️ Warning:${colors.reset} No tag prefix found for package "${versionedPackage.name}", using '${versionedPackage.name}-v' as default.`,
      );
    }

    try {
      const commitRange = getCommitRange(`${prefix}`);
      const commitsRaw = execSync(`git log ${commitRange} --format="%H %s"`)
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);

      const commits = commitsRaw
        .map((line) => {
          const [hash, ...messageParts] = line.split(" ");
          return { hash, message: messageParts.join(" ") };
        })
        .filter((c) => c.hash && c.message);

      if (!jsonOutput) {
        console.log(
          "\n" + colors.cyan + "📦 Package:" + colors.reset,
          colors.bright + versionedPackage.name + colors.reset,
        );
        console.log(
          colors.dim +
            `Found ${commits.length} commits since ${prefix}` +
            colors.reset +
            "\n",
        );
      }

      const changes = new Set<CommitInfo>();
      for (const commit of commits) {
        const hashSubstring = commit.hash.slice(0, 7);
        const message = commit.message.toLowerCase();
        if (!jsonOutput) {
          console.log(
            `${colors.magenta}🔍 Analyzing:${colors.reset}`,
            colors.dim + hashSubstring + colors.reset,
            "-",
            colors.bright + message + colors.reset,
          );
        }

        // Check if this is a versioning commit (feat, fix, or breaking change)
        const match = message.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:/);
        if (!match) {
          continue;
        }

        const [, type, scopeMatch, breakingMatch] = match;
        const scope = scopeMatch || "";
        const breaking =
          !!breakingMatch || message.includes("BREAKING CHANGE:");

        // check the scope. If it's not the same as the package,
        // skip it, if "nonScopeBehavior" is "ignore".
        // Note that the scope can be empty, we should consider that as well.
        const isScopePackage = checkPackageInScope(
          scope,
          versionedPackage.name,
        );
        const isNonScopedPackage = scope === "";
        const ignoreNonScope = config.nonScopeBehavior === "ignore";
        if (isNonScopedPackage && ignoreNonScope) {
          if (!jsonOutput) {
            console.log(
              colors.dim +
                "  → Skipping commit from non-scoped root package" +
                colors.reset,
            );
          }
          continue;
        }

        if (!isScopePackage && !(isNonScopedPackage && !ignoreNonScope)) {
          // the commit does not belong to this package.
          // Skip adding it to the changes list.
          // BUT: our power is to check
          // - if any dependencies are affected
          // - and if so, and the package is affected by the dependency changes,
          //   then we should add this commit to the changes list.
          if (!jsonOutput) {
            const isFrom = scope || "root";
            console.log(
              colors.dim +
                "  → Skipping commit from non-scoped package " +
                isFrom +
                colors.reset,
            );
          }
          continue;
        }

        // Consider all feat, fix, and breaking changes
        const isVersioningCommit =
          type === "feat" || type === "fix" || breaking;
        if (!isVersioningCommit) {
          if (!jsonOutput) {
            console.log(
              colors.dim + "  → Skipping non-versioning commit" + colors.reset,
            );
          }
          continue;
        }

        // Add the commit regardless of file changes for version determination
        changes.add({
          hash: commit.hash,
          message,
          type,
          breaking,
          reasons: ["Versioning commit detected"],
        });
        if (!jsonOutput) {
          console.log(
            colors.dim + "  → Adding commit to changes list" + colors.reset,
          );
        }

        // Get changed files in this commit for informational purposes
        const changedFiles = execSync(
          `git diff-tree --no-commit-id --name-only -r ${commit.hash}`,
        )
          .toString()
          .trim();
        const changedFilesList = changedFiles.split("\n");
        if (!jsonOutput) {
          const changedFilesCount = changedFilesList.length;
          console.log(
            colors.dim + `  Changed files: ${changedFilesCount}` + colors.reset,
          );
        }

        // Add additional reasons for commit
        const reasons: string[] = [];
        if (!versionedPackage.directory || versionedPackage.directory === ".") {
          reasons.push("Root package - considering all changes");
        } else {
          // For non-root packages, check if files are in the package directory
          if (
            changedFilesList.some((file) => {
              const normalizedFile = file.replace(/\\/g, "/");
              const normalizedDir = versionedPackage.directory.replace(
                /\\/g,
                "/",
              );
              // For root directory ('.'), any file is considered a match
              return normalizedDir === "."
                ? true
                : normalizedFile.startsWith(normalizedDir + "/") ||
                    normalizedFile === normalizedDir;
            })
          ) {
            reasons.push(`Direct changes in ${versionedPackage.directory}`);
          }

          // Check if commit is scoped to this package
          if (scope === versionedPackage.name) {
            reasons.push(`Commit scoped to ${versionedPackage.name}`);
          }

          // Check dependencies
          if (versionedPackage.dependsOn) {
            versionedPackage.dependsOn.forEach((dep) => {
              const depPattern = dep.replace("*", "");
              const matchingChanges = changedFilesList.filter((file) => {
                const normalizedFile = file.replace(/\\/g, "/");
                const normalizedPattern = depPattern.replace(/\\/g, "/");
                return (
                  normalizedFile.startsWith(normalizedPattern + "/") ||
                  normalizedFile === normalizedPattern
                );
              });
              if (matchingChanges.length > 0) {
                reasons.push(`Affected by changes in dependent package ${dep}`);
              }
            });
          }
        }

        if (reasons.length > 0) {
          // Convert the Set to an array to get the last item
          const changesArray = Array.from(changes);
          if (changesArray.length > 0) {
            changesArray[changesArray.length - 1].reasons.push(...reasons);
          }
        }
      }

      const changesArray = Array.from(changes);
      if (changesArray.length === 0) {
        if (!jsonOutput) {
          console.log(
            colors.dim +
              `No versioning commits found since ${prefix}` +
              colors.reset +
              "\n",
          );
        }
        continue;
      }
      if (changes.size > 0) {
        packageChanges.set(versionedPackage, changesArray);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      if (!jsonOutput) {
        console.error(
          `${colors.red}⛔️ ${colors.bright}Error: Failed to analyze commits for package "${versionedPackage.name}".${colors.reset}\n${colors.red}${errMsg}${colors.reset}`,
        );
      }
      if (isCI) process.exit(1);
    }
  }

  // Process each package's changes and determine version updates
  const packageChangeList = Array.from(packageChanges.entries());
  config.versionedPackages.forEach((pkg) => {
    const hasPackageChanges = packageChangeList.some(
      ([pack]) => pack.name === pkg.name,
    );
    if (hasPackageChanges) {
      const changes = Array.from(
        packageChangeList.find(([pack]) => pack.name === pkg.name)![1],
      );
      const currentVersion = getCurrentVersion(pkg.tagPrefix);
      const versionChanges = determineVersionChange(
        changes.map((c) => c.message),
      );
      const nextVersion = getNextVersion(currentVersion, versionChanges);

      if (nextVersion) {
        versionUpdates.set(pkg, {
          tagPrefix: pkg.tagPrefix,
          currentVersion,
          nextVersion,
          changes,
          hasChanges: true,
        });
      }
    }
  });

  // Output results
  if (jsonOutput) {
    const output: Map<
      string,
      {
        currentVersion: string;
        nextVersion: string;
        hasChanges: boolean;
      }
    > = new Map();
    for (const [pkg, version] of versionUpdates.entries()) {
      output.set(pkg.name, {
        currentVersion: version.currentVersion,
        nextVersion: version.nextVersion,
        hasChanges: version.hasChanges,
      });
    }
    console.log(JSON.stringify(Object.fromEntries(output)));
    return;
  }

  if (versionUpdates.size === 0) {
    console.log(
      `${colors.green}${colors.bright} ✓ No version updates required!${colors.reset}`,
    );
    return;
  }

  console.log(
    "\n" +
      colors.bright +
      colors.magenta +
      "🚀 Release Check Summary" +
      colors.reset +
      "\n",
  );
  console.log(colors.dim + "=".repeat(50) + colors.reset + "\n");

  // Changes Overview
  printSection("📦 Changes Detected:");
  if (packageChanges.size > 0) {
    const maxPkgLength = Math.max(
      ...Array.from(packageChanges.keys()).map((pack) => pack.name.length),
    );
    for (const [pack, changes] of packageChanges.entries()) {
      const pkg = pack.name.padEnd(maxPkgLength);
      console.log(
        `${colors.green}✓${colors.reset} ${pkg}  ${colors.cyan}${changes.length}${colors.reset} commits`,
      );
    }
  } else {
    console.log(`${colors.yellow}⚠ No changes detected${colors.reset}`);
  }

  // Version Updates
  printSection("📝 Version Updates:");
  if (versionUpdates.size > 0) {
    const maxPkgLength = Math.max(
      ...Array.from(versionUpdates.keys()).map((pack) => pack.name.length),
    );
    for (const [pack, update] of versionUpdates.entries()) {
      const pkg = pack.name.padEnd(maxPkgLength);
      const { tagPrefix, currentVersion, nextVersion } = update;
      console.log(
        `${colors.green}✓${colors.reset} ${pkg}  ${colors.dim}${tagPrefix}${currentVersion}${colors.reset} → ${colors.bright}${tagPrefix}${nextVersion}${colors.reset}`,
      );
    }
  } else {
    console.log(`${colors.yellow}⚠ No version updates needed${colors.reset}`);
  }

  // Detailed Changes
  printSection("🔍 Detailed Changes:");
  if (packageChanges.size > 0) {
    for (const [pack, changes] of packageChanges.entries()) {
      const pkg = pack.name;
      console.log(`\n${colors.cyan}${pkg}${colors.reset}:`);
      for (const { hash, message, reasons } of changes) {
        console.log(
          `  ${colors.green}•${colors.reset} ${formatCommit(hash, message)}`,
        );
        for (const reason of reasons) {
          console.log(`    ${colors.dim}↳ ${reason}${colors.reset}`);
        }
      }
    }
  } else {
    console.log(
      `${colors.yellow}⚠ No detailed changes to show${colors.reset}`,
    );
  }

  console.log("\n" + colors.dim + "=".repeat(50) + colors.reset + "\n");
}

// Export functions for testing
export {
  determineVersionChange as determineNextVersion,
  getCommitRange,
  getCurrentVersion,
  getLastTag,
  getNextVersion,
};

// Main execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkVersions(
    process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true",
  );
}
