# Get Next Versions

[![Release](https://github.com/benjamin-kraatz/get-next-versions/actions/workflows/release.yml/badge.svg)](https://github.com/benjamin-kraatz/get-next-versions/actions/workflows/release.yml)
[![NPM](https://img.shields.io/npm/v/get-next-versions.svg)](https://www.npmjs.com/package/get-next-versions)

> ⚠️ **Development Status**: This package is currently in early development (version < 1.0). The API and functionality may change significantly between releases. Use with caution in production environments.

Automated versioning tool based on conventional commits and package dependencies. Available as both an NPM package and a GitHub Action.

> 🔄 **Fun fact**: This package uses itself for versioning! Check out our [release-config](https://github.com/benjamin-kraatz/get-next-versions/blob/main/release-config.json) and [release workflow](https://github.com/benjamin-kraatz/get-next-versions/blob/main/.github/workflows/release.yml) to see how we automate our own version management.

## Overview

`get-next-versions` is a powerful automated versioning tool designed for both monorepos and single-package repositories. It analyzes your git commit history using conventional commits to automatically determine the next semantic version for your packages. Key features include:

- 🔄 Automated version determination based on conventional commits
- 📦 Support for monorepos with multiple packages
- 🔗 Intelligent dependency tracking between packages
- 🤖 Available as both an NPM package and a GitHub Action
- 🎯 Configurable version bump rules
- 💻 Human-readable CLI output and JSON format for CI environments

### How It Works

1. Analyzes git commit history since the last version tag
2. Parses conventional commit messages to determine version changes
3. Tracks dependencies between packages to ensure consistent versioning
4. Determines appropriate version bumps based on commit types
5. Outputs human-readable or JSON-formatted version information

### Important Note on Single-Package Repositories

While this tool _could_ be used with single-package repositories, it was primarily designed and tested for monorepo environments. Using it with single-package repositories comes with some trade-offs:

1. **Configuration Overhead**

   - You still need to maintain a `release-config.json` file
   - The monorepo-focused configuration might feel unnecessarily complex for a single package

2. **Tag Management**

   - The tag prefix system, while powerful for monorepos, adds an extra layer of complexity
   - Standard version tags (e.g., `v1.0.0`) require explicit configuration
   - Some existing version management tools might be more straightforward for single packages

3. **Feature Underutilization**
   - The dependency tracking feature becomes redundant
   - The package-scoped commit parsing might be overly strict for single-package needs

For single-package repositories, you might want to consider alternatives like:

- `standard-version`
- `semantic-release`
- GitHub's built-in release management

## Installation

You can install this package from NPM:

```bash
# From NPM
npm install --save-dev get-next-versions
```

## NPM Package Usage

### Configuration

Create a `release-config.json` file in your repository root. You can find the [full configuration below](#configuration-options):

```json
{
  "versionedPackages": [
    {
      "name": "app",
      "tagPrefix": "app-v",
      "directory": "apps/app",
      "dependsOn": ["packages/package-a"]
    },
    {
      "name": "package-a",
      "tagPrefix": "pkg-v",
      "directory": "packages/package-a"
    }
  ]
}
```

### CLI Usage

```bash
# Add to package.json scripts
{
  "scripts": {
    "version-check": "get-next-versions"
  }
}

# Run version check (human-readable output)
npm run version-check

# Run version check (JSON output)
npm run version-check --json

# Recommended: when there are changes and new versions are detected,
# add the new tags to your repository
# For example: pkg-v1.1.0 was detected
git tag "pkg-v1.1.0"
git push origin "pkg-v1.1.0" # or git push --tags
```

The tool automatically detects if it's running in a CI environment (GitHub Actions, Jenkins, etc.) and will output JSON format when appropriate. Check out the [output examples below](#cli-output-formats).

## GitHub Action Usage

```yaml
name: Version Check

on:
  push:
    branches: [main]

jobs:
  check-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Check Version
        uses: benjamin-kraatz/get-next-versions@v1
        id: version_check
        with:
          config-path: "./release-config.json"

      - name: Use Version Info
        if: ${{ fromJSON(steps.version_check.outputs.changes).your-package.has_changes }}
        run: |
          echo "New version: ${{ fromJSON(steps.version_check.outputs.changes).your-package.next_version }}"
          # ... other actions ...
          # we recommend adding tags here
```

## Configuration Options

The `release-config.json` file is the heart of your versioning configuration. Here's a detailed explanation of each configuration option:

```json
{
  "versionedPackages": [
    {
      "name": "your-package",
      "tagPrefix": "pkg-v",
      "directory": "packages/your-package",
      "dependsOn": ["packages/*"]
    }
  ],
  "nonScopeBehavior": "ignore"
}
```

### Package Configuration Fields Explained

- `name` (required): The package identifier used in commit messages and for version tracking. This should match the package name in your commit scopes (e.g., `feat(your-package): new feature`).

- `tagPrefix` (required): The prefix used for git version tags. For example, with prefix `pkg-v`, tags will look like `pkg-v1.0.0`. This allows different packages to maintain independent version histories.

- `directory` (required): The location of your package in the repository. This is used to:

  - Track direct changes to package files
  - Determine when changes affect this package
  - Support monorepo structures with multiple packages

- `dependsOn` (optional): An array of glob patterns indicating which other packages or directories this package depends on. When changes are detected in dependent packages, the current package will also receive a version bump. Examples:
  - `["packages/*"]`: Depends on all packages in the packages directory
  - `["packages/ui", "packages/core"]`: Depends on specific packages
  - `["shared/**"]`: Depends on everything in the shared directory

- `nonScopeBehavior` (optional): Determines the behavior when a commit doesn't have a scope. This is the case when commits were made for the root/entire repository. Options:
  - `"bump"` (default): Consider this commit as a version bump
  - `"ignore"`: Ignore the commit

### Git Tags and Version History

The tool relies on git tags to track version history for each package. Here's what you need to know:

1. **Tag Format**

   - Each package uses its own tag prefix (e.g., `pkg-v1.0.0`, `ui-v2.1.0`)
   - Tags must follow the format: `{tagPrefix}{version}`
   - Example: For a package with `tagPrefix: "pkg-v"`, tags should be like:
     ```bash
     pkg-v0.1.0
     pkg-v1.0.0
     pkg-v1.1.0
     ```

2. **Version Detection**

   - The tool checks commit history since the last matching tag for each package
   - If no tag exists for a package, it starts from version `0.0.0`
   - Each package's version history is tracked independently

3. **Tag Management**

   - Tags should be created after each version bump
   - Can be done manually:
     ```bash
     # After confirming version bump to 1.1.0
     git tag pkg-v1.1.0
     git push origin pkg-v1.1.0
     ```
   - Or automatically in CI (recommended):

     ```yaml
     # Example GitHub Action workflow
     - name: Check Version
       uses: benjamin-kraatz/get-next-versions@v1
       id: version_check

     - name: Create Tag
       if: ${{ fromJSON(steps.version_check.outputs.changes).your-package.has_changes }}
       run: |
         NEW_VERSION=${{ fromJSON(steps.version_check.outputs.changes).your-package.next_version }}
         git tag "pkg-v${NEW_VERSION}"
         git push origin "pkg-v${NEW_VERSION}"
     ```

4. **Best Practices**
   - Always use unique tag prefixes for each package
   - Keep tags synchronized between all environments
   - In CI, use `fetch-depth: 0` to ensure full git history
   - Consider automating tag creation to avoid manual errors

### Version Bump Rules

The tool follows semantic versioning (MAJOR.MINOR.PATCH) rules based on conventional commits:

1. **Major Version** (1.0.0 → 2.0.0)
   Breaking changes are detected from:

   - Commits with a breaking change marker: `feat(pkg)!: message`
   - Commits with a BREAKING CHANGE footer:

     ```
     feat(pkg): message

     BREAKING CHANGE: description of breaking change
     ```

2. **Minor Version** (1.0.0 → 1.1.0)
   New features are detected from:

   - Feature commits: `feat(pkg): message`
   - New functionality that doesn't break existing code

3. **Patch Version** (1.0.0 → 1.0.1)
   Patches are detected from `fix` commit types:
   - `fix(pkg): message`

**Other conventional commit types are _not_ causing a version bump!**

Here are some examples:

- Chores: `chore(pkg): message`
- Refactor commits: `refactor(pkg): message`
- Documentation: `docs(pkg): message`
- Styles: `style(pkg): message`
- Code refactoring: `refactor(pkg): message`
- Performance improvements: `perf(pkg): message`
- Tests: `test(pkg): message`
- Build changes: `build(pkg): message`
- CI changes: `ci(pkg): message`
- Chores: `chore(pkg): message`

### CLI Output Formats

The tool provides two output formats:

1. **Human-Readable Output** (default in non-CI environments):

   ```
    🚀 Release Check Summary
    ==================================================
    📦 Changes Detected:
    ✓ app: 2 commits
    ✓ package-a: 3 commits

    📝 Version Updates:
    ✓ app: app-v1.0.0 → app-v1.1.0
    ✓ package-a: pkg-v2.1.5 → pkg-v3.0.0

    🔍 Detailed Changes:
    app:
      • abc0102 feat(app): add new feature
        ↳ Direct changes in apps/app
      • ghi9012 fix(package-a): fix bug
        ↳ Affected by changes in dependent package packages/package-a
    package-a:
      • abc1234 feat(package-a): add new feature
        ↳ Direct changes in packages/package-a
      • def5678 feat(package-a)!: breaking change
        ↳ Direct changes in packages/package-a
      • ghi9012 fix(package-a): fix bug
        ↳ Direct changes in packages/package-a

   ```

2. **JSON Output** (automatic in CI environments):
   ```json
   {
     "app": {
       "currentVersion": "1.0.0",
       "nextVersion": "1.1.0",
       "hasChanges": true
     },
     "package-a": {
       "currentVersion": "2.1.5",
       "nextVersion": "3.0.0",
       "hasChanges": true
     }
   }
   ```

## Best Practices

1. **Commit Messages**

   - Always use conventional commit format: `type(scope): message`
   - Include package name in the scope
   - Use clear and descriptive messages

2. **Configuration**

   - Keep `release-config.json` in your repository root
   - Use specific `dependsOn` patterns to avoid unnecessary version bumps
   - Choose clear and consistent `tagPrefix` values

3. **Monorepo Usage**

   - Configure each package separately in `versionedPackages`
   - Use `dependsOn` to manage package relationships
   - Maintain independent version histories with unique `tagPrefix`

4. **CI Integration**
   - Use the GitHub Action for automated version checks
   - Leverage JSON output for automated workflows
   - Consider implementing automated release processes

## Troubleshooting

Common issues and solutions:

1. **No Version Changes Detected**

   - Verify your commit messages follow conventional commit format
   - Check if changes are in the correct package directory
   - Ensure your git history is complete (use `fetch-depth: 0` in CI)

2. **Unexpected Version Bumps**

   - Review `dependsOn` patterns for over-broad matches
   - Check commit messages for correct package scopes
   - Verify breaking change syntax in commits

3. **Missing Git History**
   - Ensure you have fetched all tags: `git fetch --tags`
   - In GitHub Actions, use `fetch-depth: 0`
   - Verify tag prefix matches your configuration

## Development

```bash
# Install dependencies
npm install

# Run tests
# NOTE: currently we have not migrated Jest to TypeScript.
# Therefore, a build step is required before running tests.
# It is included in the `test` script.
npm test

# Build
npm run build
```

## Requirements

- Node.js >= 20

## License

MIT
