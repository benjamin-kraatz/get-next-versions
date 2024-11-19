import { createTag, formatCommit } from "./commits.js";
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
export async function output(
  mode: "json" | "cli",
  data: {
    packageChanges: Map<Package, CommitInfo[]>;
    versionUpdates: Map<Package, VersionUpdate>;
    cliOptions: CLIOptions;
  },
): Promise<void> {
  if (mode === "json") {
    outputJSON(data.versionUpdates);
  } else {
    await outputCLI(data.cliOptions, data.packageChanges, data.versionUpdates);
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
async function outputCLI(
  cliOptions: CLIOptions,
  packageChanges: Map<Package, CommitInfo[]>,
  versionUpdates: Map<Package, VersionUpdate>,
): Promise<void> {
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
      const newTag = `${tagPrefix}${nextVersion}`;
      createTag(newTag);
      console.log(
        `${colors.green}✓${colors.reset} ${pack.name}  ${colors.dim}${tagPrefix}${nextVersion}${colors.reset}`,
      );
    }

    console.log(`\n${separator}`);
  } else {
    // no auto-create tags.
    // Ask the user if they want to create tags
    console.log(
      `\n${colors.bright}${colors.magenta}🚀 Create tags?${colors.reset}\n${colors.dim}Press Y(es, default), N(o), or C(reate without pushing)${colors.reset}`,
    );
    // Y = yes (default), n = no, c = create-only-dont-push
    const response = await prompt();
    if (!response) {
      return;
    }
    if (
      response === "y" ||
      response === "\r" ||
      response === "\n" ||
      response === "c"
    ) {
      const isCreateOnly = response === "c";
      console.log(
        `\n${colors.bright}${colors.magenta}🚀 Creating and publishing tags${colors.reset}\n`,
      );
      for (const [pack, update] of versionUpdates) {
        const { tagPrefix, nextVersion } = update;
        const newTag = `${tagPrefix}${nextVersion}`;
        createTag(newTag, !isCreateOnly);
        console.log(
          `${colors.green}✓${colors.reset} ${pack.name}  ${colors.dim}${tagPrefix}${nextVersion}${colors.reset}`,
        );
      }
      console.log(`\n${separator}`);
    } else {
      console.log(
        `\n${colors.dim}${colors.white}⚠ Skipped creating and publishing tags${colors.reset}\n`,
      );
    }
  }
}

function prompt(): Promise<string> {
  if (process.stdin.isTTY) {
    // Enable raw mode to get immediate keystrokes
    process.stdin.setRawMode(true);
  }

  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve) => {
    const onData = (key: string) => {
      // Ctrl-C
      if (key === "\u0003") {
        process.exit();
      }

      // Clean up
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      // Add a newline since we're in raw mode
      process.stdout.write("\n");

      resolve(key.toLowerCase());
    };

    process.stdin.on("data", onData);
  });
}
