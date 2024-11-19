import { readFileSync } from "fs";
import { Config, nonScopeBehaviors } from "./types.js";

/**
 * Loads a configuration from the given path.
 *
 * The configuration is expected to be a JSON file with the following properties:
 * - `versionedPackages`: An array of package configurations. Each package
 *   configuration has the following properties:
 *   - `name`: The name of the package.
 *   - `tagPrefix`: The prefix for the package's tags.
 *   - `directory`: The directory of the package.
 *   - `dependsOn`: An array of package names or glob patterns that the
 *     package depends on.
 * - `nonScopeBehavior`: Optional. Must be either "ignore" or "bump". If
 *   present, determines whether packages outside of the scope should be
 *   ignored or bumped.
 *
 * If the configuration is invalid, the function throws an error.
 *
 * @param path - The path to the configuration file.
 * @returns The loaded configuration.
 */
export function loadConfig(path: string): Config {
  const config = JSON.parse(readFileSync(path, "utf8")) as Config;
  if (
    config.nonScopeBehavior &&
    !nonScopeBehaviors.includes(config.nonScopeBehavior)
  ) {
    throw new Error("nonScopeBehavior must be either 'ignore' or 'bump'");
  }

  return config;
}
