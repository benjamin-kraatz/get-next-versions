import { formatCommit, runCommand } from "./commits.js";
import { colors, printSection } from "./helpers.js";
import { CLIOptions, CommitInfo, Package, VersionUpdate } from "./types.js";

/**
 * Outputs the release summary to the console in a human-readable format or
 * as JSON, depending on the mode.
 *
 * @param mode - The output mode. Either "json" or "cli".
 * @param packageChanges - A map where each key is a Package object and each
 * value is an array of CommitInfo objects containing commit information.
 * @param versionUpdates - A map where each key is a Package object and each
 * value is a VersionUpdate object containing version information.
 */
export function output(
  mode: "json" | "cli",
  data: {
    packageChanges: Map<Package, CommitInfo[]>;
    versionUpdates: Map<Package, VersionUpdate>;
    cliOptions: CLIOptions;
  },
): void {
  if (mode === "json") {
    outputJSON(data.versionUpdates);
  } else {
    outputCLI(data.cliOptions, data.packageChanges, data.versionUpdates);
  }
}

/**
 * Converts a map of version updates to a JSON string and logs it.
 *
 * Each entry in the map contains the package name as the key and an object
 * with current version, next version, and change status as the value.
 *
 * Use it in CI environment to output JSON to stdout.
 * @param versionUpdates - A map where each key is a Package object and each
 * value is a VersionUpdate object containing version information.
 */
function outputJSON(versionUpdates: Map<Package, VersionUpdate>): void {
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
}

/**
 * Outputs the release summary to the console in a human-readable format.
 *
 * This function logs an overview of detected changes, version updates, and
 * detailed changes for each package. It uses colored output for better
 * readability and organizes the information into sections.
 *
 * @param packageChanges - A map where each key is a Package object and each
 * value is an array of CommitInfo objects representing changes.
 * @param versionUpdates - A map where each key is a Package object and each
 * value is a VersionUpdate object containing version information.
 */
function outputCLI(
  cliOptions: CLIOptions,
  packageChanges: Map<Package, CommitInfo[]>,
  versionUpdates: Map<Package, VersionUpdate>,
): void {
  const noUpdatesMessage = `${colors.green}${colors.bright} ✓ No version updates required!${colors.reset}`;
  const separator = "\n" + colors.dim + "=".repeat(50) + colors.reset + "\n";

  if (versionUpdates.size === 0) {
    console.log(noUpdatesMessage);
    return;
  }

  console.log(
    `\n${colors.bright}${colors.magenta}🚀 Release Check Summary${colors.reset}\n${separator}`,
  );

  // Changes Overview
  printSection("📦 Changes Detected:");
  if (packageChanges.size > 0) {
    const maxPkgLength = Math.max(
      ...[...packageChanges.keys()].map((pack) => pack.name.length),
    );
    for (const [pack, changes] of packageChanges) {
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
      ...[...versionUpdates.keys()].map((pack) => pack.name.length),
    );
    for (const [pack, update] of versionUpdates) {
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
    for (const [pack, changes] of packageChanges) {
      console.log(`\n${colors.cyan}${pack.name}${colors.reset}:`);
      changes.forEach(({ hash, message, reasons }) => {
        console.log(
          `  ${colors.green}•${colors.reset} ${formatCommit(hash, message)}`,
        );
        reasons.forEach((reason) =>
          console.log(`    ${colors.dim}↳ ${reason}${colors.reset}`),
        );
      });
    }
  } else {
    console.log(
      `${colors.yellow}⚠ No detailed changes to show${colors.reset}`,
    );
  }

  console.log(separator);

  if (cliOptions.createTags) {
    console.log(
      `\n${colors.bright}${colors.magenta}🚀 Creating and publishing tags${colors.reset}\n`,
    );
    for (const [pack, update] of versionUpdates) {
      const { tagPrefix, nextVersion } = update;
      runCommand(`git tag ${tagPrefix}${nextVersion}`);
      runCommand(`git push origin ${tagPrefix}${nextVersion}`);
      console.log(
        `${colors.green}✓${colors.reset} ${pack.name}  ${colors.dim}${tagPrefix}${nextVersion}${colors.reset}`,
      );
    }

    console.log(`\n${separator}`);
  }
}
