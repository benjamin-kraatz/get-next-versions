# Get Next Versions

Automated versioning tool based on conventional commits and package dependencies. Available as both an NPM package and a GitHub Action.

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

## NPM Package Usage

### Installation

```bash
npm install --save-dev get-next-versions
# or
yarn add --dev get-next-versions
# or
pnpm add -D get-next-versions
```

### Configuration

Create a `release-config.json` file in your repository root:

```json
{
  "versionedPackages": [
    {
      "name": "your-package",
      "tagPrefix": "pkg-v",
      "directory": "packages/your-package",
      "dependsOn": ["packages/*"]
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
```

The tool automatically detects if it's running in a CI environment (GitHub Actions, Jenkins, etc.) and will output JSON format when appropriate.

## GitHub Action Usage

```yaml
name: Version Check

on:
  push:
    branches: [ main ]

jobs:
  check-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      
      - name: Check Version
        uses: yourusername/get-next-versions@v1
        id: version_check
        with:
          config-path: './release-config.json'
      
      - name: Use Version Info
        if: ${{ fromJSON(steps.version_check.outputs.changes).your-package.has_changes }}
        run: |
          echo "New version: ${{ fromJSON(steps.version_check.outputs.changes).your-package.next_version }}"
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
  ]
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
   Patches are detected from various commit types:
   - Bug fixes: `fix(pkg): message`
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
   ✓ your-package: 5 commits

   📝 Version Updates:
   ✓ your-package: pkg-v1.0.0 → pkg-v1.1.0

   🔍 Detailed Changes:
   your-package:
     • abc1234 feat(your-package): add new feature
       ↳ Direct changes in packages/your-package
     • def5678 fix(your-package): fix bug
       ↳ Direct changes in packages/your-package
   ```

2. **JSON Output** (automatic in CI environments):
   ```json
   {
     "your-package": {
       "currentVersion": "1.0.0",
       "nextVersion": "1.1.0",
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
npm test

# Build
npm run build
```

## Requirements

- Node.js >= 20

## License

MIT
