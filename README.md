# Get Next Versions

Automated versioning tool based on conventional commits and package dependencies. Available as both an NPM package and a GitHub Action.

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
      "directory": "packages/your-package"
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

### Package Configuration Fields

- `name`: Package identifier used in commit messages
- `tagPrefix`: Git tag prefix for version tracking
- `directory`: Package location in repository
- `dependsOn`: Optional glob patterns for dependencies

### Version Bump Rules

1. **Major Version** (1.0.0 → 2.0.0)
   - Commits with breaking changes:
     - `feat(pkg)!: message`
     - `feat(pkg): message\n\nBREAKING CHANGE: description`

2. **Minor Version** (1.0.0 → 1.1.0)
   - New features: `feat(pkg): message`

3. **Patch Version** (1.0.0 → 1.0.1)
   - Bug fixes: `fix(pkg): message`

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
