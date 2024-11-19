import { execSync } from "child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommit, getCommitRange, getLastTag } from "./commits.js";
import { loadConfig } from "./config.js";
import { checkPackageInScope, colors, printSection } from "./helpers.js";
import { CommitInfo, Config, Package, VersionUpdate } from "./types.js";
import {
  createVersion,
  determineVersionChange,
  getCurrentVersion,
} from "./versions.js";

// Load configuration
const CONFIG_PATH = resolve(process.cwd(), "release-config.json");
let config: Config | undefined;

// Initialize maps to store changes and version updates
const packageChanges = new Map<Package, CommitInfo[]>();
const versionUpdates = new Map<Package, VersionUpdate>();
let jsonOutput = false;

export function checkVersions(isCI: boolean = false): void {
  const args = process.argv.slice(2);
  jsonOutput = args.includes("--json");

  packageChanges.clear();
  versionUpdates.clear();

  try {
    const configPath = CONFIG_PATH || args[0];
    config = loadConfig(configPath);
    if (!config) {
      throw new Error("Failed to parse config file.");
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    if (isCI) {
      console.error(`Error parsing config file: ${errMsg}`);
      process.exit(1);
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
      const nextVersion = createVersion(currentVersion, versionChanges);

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
  createVersion,
  determineVersionChange as determineNextVersion,
  getCommitRange,
  getCurrentVersion,
  getLastTag,
};

// Main execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkVersions(
    process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true",
  );
}
