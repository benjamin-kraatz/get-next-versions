import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatCommit,
  getChangedFilesInCommit,
  getCommitRange,
  getCommitsForTag,
  getLastTag,
  parseCommitInfo,
} from "./commits.js";
import { loadConfig } from "./config.js";
import { checkPackageInScope, colors, printSection } from "./helpers.js";
import {
  CommitInfo,
  CommitMessage,
  Config,
  Package,
  VersionUpdate,
} from "./types.js";
import {
  createVersion,
  determineVersionChange,
  getCurrentVersion,
  isCommitAnyRelevantConvention,
} from "./versions.js";

// Load configuration
const CONFIG_PATH = resolve(process.cwd(), "release-config.json");
let config: Config | undefined;

// Initialize maps to store changes and version updates
const packageChanges = new Map<Package, CommitInfo[]>();
const versionUpdates = new Map<Package, VersionUpdate>();
let jsonOutput = false;
let verboseMode = false;

export function checkVersions(isCI: boolean = false): void {
  const args = process.argv.slice(2);
  jsonOutput = args.includes("--json");
  verboseMode = args.includes("--verbose");

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

  // get all commits up to the last tag for each package.
  // If there is no tag, start from the root commit for each package.
  let commitMessages: CommitMessage[] = [];
  if (!jsonOutput) {
    console.log(
      `${colors.green}✅ ${colors.bright}Found ${config.versionedPackages.length} packages in config file.${colors.reset}`,
    );
  }

  for (const pkg of config.versionedPackages) {
    const prefix = pkg.tagPrefix || "v";
    if (!jsonOutput && !pkg.tagPrefix) {
      console.warn(
        `${colors.yellow}⚠️ Warning:${colors.reset} No tag prefix found for package "${pkg.name}", using '${prefix}' as default.`,
      );
    }
    const lastTag = getLastTag(prefix);
    const version = lastTag?.replaceAll(prefix, "") || "0.0.0";

    if (!jsonOutput) {
      console.log(
        "\n" + colors.cyan + "📦 Package:" + colors.reset,
        colors.bright +
          pkg.name +
          ` ${colors.reset}${colors.dim}(${version})` +
          colors.reset,
      );
    }

    const commits = getCommitsForTag(lastTag || "HEAD");
    commitMessages.push(...commits);

    // clean up commit messages to remove duplicates.
    // we do it here instead of after the loop to prevent memory overusage.
    commitMessages = commitMessages.filter(
      (commit, index) => commitMessages.indexOf(commit) === index,
    );

    // filter the commits to only include those that affect the current package.
    const commitsForPackage: CommitInfo[] = [];
    for (const commit of commits) {
      if (!jsonOutput && verboseMode) {
        console.log(
          `${colors.magenta}🔍 Analyzing:${colors.reset}`,
          colors.dim + commit.hash.slice(0, 7) + colors.reset,
          "-",
          colors.bright + commit.message + colors.reset,
        );
      }

      const commitInfo = parseCommitInfo(commit.message);
      if (!commitInfo) {
        continue;
      }

      const relevance = isCommitAnyRelevantConvention(commit.message);
      if (!relevance.isRelevant) {
        // this isn't a relevant commit at all.
        continue;
      }

      const addToList = (reason: string) => {
        commitsForPackage.push({
          hash: commit.hash,
          message: commit.message,
          type: relevance.type ?? commitInfo.type,
          breaking: relevance.type === "major" || commitInfo.breaking,
          reasons: [reason],
        });
      };

      // if the commit is a breaking change, we can completely skip the loop.
      // A breaking change always bumps to the highest version possible,
      // so no other version checks necessary.
      if (
        relevance.type === "major" ||
        commitInfo.breaking ||
        commitInfo.type === "major"
      ) {
        if (!jsonOutput && verboseMode) {
          console.log(colors.dim + "  → Major version bump" + colors.reset);
        }
        addToList("Major version bump");
        break;
      }

      // here comes the twist: if the directory is ".", we set the package scope to "".
      const packageScope = pkg.directory === "." ? "" : pkg.name;
      const packageIsRootScope = packageScope === "";
      const isInScope = checkPackageInScope(commitInfo.scope, packageScope);
      const scope = commitInfo.scope;
      const isRootScope = scope === "";
      if (!isInScope && !isRootScope) {
        // that's a scope that we don't care about, so we can skip it.
        // But we want to include the `dependsOn` checks and commits as well.
        // Check dependencies
        const changedFilesList = getChangedFilesInCommit(commit.hash);
        if (!jsonOutput && verboseMode) {
          const changedFilesCount = changedFilesList.length;
          console.log(
            colors.dim + `  Changed files: ${changedFilesCount}` + colors.reset,
          );
        }

        // For non-root packages, check if files are in the package directory
        if (
          changedFilesList.some((file) => {
            const normalizedFile = file.replace(/\\/g, "/");
            const normalizedDir = pkg.directory.replace(/\\/g, "/");
            // For root directory ('.'), any file is considered a match
            return normalizedDir === "."
              ? true
              : normalizedFile.startsWith(normalizedDir + "/") ||
                  normalizedFile === normalizedDir;
          })
        ) {
          addToList(`Direct changes in ${pkg.directory}`);
          if (!jsonOutput && verboseMode) {
            console.log(
              colors.dim +
                "  → Direct changes in package directory" +
                colors.reset,
            );
          }
        }

        if (pkg.dependsOn) {
          pkg.dependsOn.forEach((dep) => {
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
              addToList(`Affected by changes in dependent package ${dep}`);
              if (!jsonOutput && verboseMode) {
                console.log(
                  colors.dim +
                    "  → Affected by changes in dependent package" +
                    colors.reset,
                );
              }
            }
          });
        }
        continue;
      }
      if (isInScope && !isRootScope) {
        // it is the package itself.
        addToList("Changes in package scope");
        if (!jsonOutput && verboseMode) {
          console.log(
            colors.dim + "  → Changes in package scope" + colors.reset,
          );
        }
        continue;
      }

      // check if the scope of the commit is root, and if so,
      // only include the commit if the nonScopeBehavior is "bump".
      const bumpRootScope =
        packageIsRootScope || config!.nonScopeBehavior === "bump";
      if (isRootScope && bumpRootScope) {
        if (!jsonOutput && verboseMode) {
          console.log(
            colors.dim +
              `  → Changes in ${packageIsRootScope ? "scope" : "root (nonScopeBehavior is set to 'bump')"}` +
              colors.reset,
          );
        }

        addToList(
          packageIsRootScope
            ? "Changes in scope"
            : "Changes in root (nonScopeBehavior is set to 'bump')",
        );
        continue;
      }
    }

    packageChanges.set(pkg, commitsForPackage);

    if (!jsonOutput) {
      const countCommitsPerPackage = packageChanges.get(pkg)?.length ?? 0;
      console.log(
        colors.dim +
          `   Found ${countCommitsPerPackage} relevant commits${lastTag ? ` since ${lastTag}` : ""}` +
          colors.reset +
          "\n",
      );
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
          hasChanges: currentVersion !== nextVersion,
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
