import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
const CONFIG_PATH = resolve(process.cwd(), 'release-config.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

// Check if --json flag is passed
let jsonOutput = process.argv.includes('--json');

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
};

function formatCommit(hash, message) {
  return `${colors.yellow}${hash.slice(0, 7)}${colors.reset} ${message}`;
}

function printSection(title, content = '') {
  console.log(`\n${colors.bright}${colors.blue}${title}${colors.reset}`);
  if (content) {
    console.log(content);
  }
}

function getLastTag(prefix) {
  try {
    // Redirect stderr to /dev/null to suppress "fatal: No names found" message
    return execSync(`git describe --tags --match "${prefix}*" --abbrev=0 2>/dev/null`).toString().trim();
  } catch (error) {
    return '';
  }
}

function getCommitRange(prefix) {
  const lastTag = getLastTag(prefix);
  return lastTag ? `${lastTag}..HEAD` : 'HEAD';
}

function getCurrentVersion(prefix) {
  try {
    const tag = getLastTag(prefix);
    return tag ? tag.replace(prefix, '') : '0.0.0';
  } catch (error) {
    return '0.0.0';
  }
}

function determineNextVersion(commits) {
  let major = false;
  let minor = false;
  let patch = false;

  commits.forEach(({ message }) => {
    if (!jsonOutput) {
      console.log('Analyzing commit message:', message);
    }

    const match = message.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:/);
    if (match) {
      const [, type, scope, breaking] = match;

      if (message.includes('BREAKING CHANGE:') || breaking) {
        major = true;
      } else if (type === 'feat') {
        minor = true;
      } else if (['fix', 'chore', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci'].includes(type)) {
        patch = true;
      }
    }
  });

  return { major, minor, patch };
}

function getNextVersion(currentVersion, changes) {
  if (!changes || !Object.keys(changes).length) return null;

  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  if (changes.major) {
    return `${major + 1}.0.0`;
  } else if (changes.minor) {
    return `${major}.${minor + 1}.0`;
  } else if (changes.patch) {
    return `${major}.${minor}.${patch + 1}`;
  }
  
  return null;
}

// Track affected packages with their changes
const packageChanges = new Map();

function addPackageChange(pkg, hash, message, reason) {
  if (!packageChanges.has(pkg)) {
    packageChanges.set(pkg, new Map());
  }
  const pkgChanges = packageChanges.get(pkg);
  if (!pkgChanges.has(hash)) {
    pkgChanges.set(hash, { hash, message, reasons: [] });
  }
  pkgChanges.get(hash).reasons.push(reason);
}

// Process all commits and their changes
const packageCommits = new Map();

// Get commits for each package since their last tag
config.versionedPackages.forEach(pkg => {
  const range = getCommitRange(pkg.tagPrefix);
  try {
    const commits = execSync(`git log ${range} --format="%H %s"`).toString().trim().split('\n').filter(Boolean);
    if (!jsonOutput) {
      console.log(`Found ${commits.length} commits for ${pkg.name} since ${pkg.tagPrefix}`);
    }
    packageCommits.set(pkg.name, commits);
  } catch (error) {
    if (!jsonOutput) {
      console.log(`No commits found for ${pkg.name} since last tag`);
    }
    packageCommits.set(pkg.name, []);
  }
});

// Process commits for each package
config.versionedPackages.forEach(pkg => {
  const commits = packageCommits.get(pkg.name);
  
  commits.forEach(commit => {
    if (!commit) return;
    const [hash, ...messageParts] = commit.split(' ');
    const message = messageParts.join(' ');

    // Get changed files in this commit
    const changedFiles = execSync(`git diff-tree --no-commit-id --name-only -r ${hash}`).toString().trim();

    // Check for direct changes in package directory
    if (changedFiles.includes(pkg.directory)) {
      addPackageChange(pkg.name, hash, message, `Direct changes in ${pkg.directory}`);
    }

    // Check conventional commit scope
    const scopeMatch = message.match(/^[a-z]+\(([^)]+)\)(!)?:/);
    if (scopeMatch && scopeMatch[1] === pkg.name) {
      addPackageChange(pkg.name, hash, message, `Commit scoped to ${pkg.name}`);
    }

    // Check dependencies if specified
    if (pkg.dependsOn) {
      const changedFilesList = changedFiles.split('\n');
      pkg.dependsOn.forEach(dep => {
        // Convert glob pattern to a regular string for basic matching
        // This handles the basic case of "packages/*" -> "packages/"
        const depPattern = dep.replace('*', '');
        
        // Check if any of the changed files match this dependency pattern
        const matchingChanges = changedFilesList.filter(file => file.startsWith(depPattern));
        if (matchingChanges.length > 0) {
          // Add details about which specific files in the dependency changed
          const affectingFiles = matchingChanges.join(', ');
          addPackageChange(pkg.name, hash, message, 
            `Changes in dependent package ${dep} affect this package: ${affectingFiles}`);
        }
      });
    }
  });
});

// Calculate version updates
const versionUpdates = new Map();

// Process each package's changes and determine version updates
config.versionedPackages.forEach(pkg => {
  if (packageChanges.has(pkg.name)) {
    const changes = packageChanges.get(pkg.name);
    const currentVersion = getCurrentVersion(pkg.tagPrefix);
    const versionChanges = determineNextVersion(changes);
    const nextVersion = getNextVersion(currentVersion, versionChanges);
    
    if (nextVersion) {
      versionUpdates.set(pkg.name, {
        tagPrefix: pkg.tagPrefix,
        currentVersion,
        nextVersion,
        changes
      });
    }
  }
});

// Output results
if (jsonOutput) {
  const output = {};
  
  config.versionedPackages.forEach(pkg => {
    output[pkg.name] = {
      currentVersion: getCurrentVersion(pkg.tagPrefix),
      nextVersion: versionUpdates.has(pkg.name) ? versionUpdates.get(pkg.name).nextVersion : null,
      hasChanges: packageChanges.has(pkg.name)
    };
  });
  
  console.log(JSON.stringify(output));
} else {
  console.log('\n' + colors.bright + colors.magenta + '🚀 Release Check Summary' + colors.reset + '\n');
  console.log(colors.dim + '=' .repeat(50) + colors.reset + '\n');

  // Changes Overview
  printSection('📦 Changes Detected:');
  if (packageChanges.size > 0) {
    packageChanges.forEach((changes, pkg) => {
      console.log(`${colors.green}✓${colors.reset} ${pkg}: ${colors.cyan}${changes.size}${colors.reset} commits`);
    });
  } else {
    console.log(`${colors.yellow}⚠ No changes detected${colors.reset}`);
  }

  // Version Updates
  printSection('📝 Version Updates:');
  if (versionUpdates.size > 0) {
    versionUpdates.forEach(({ tagPrefix, currentVersion, nextVersion }, pkg) => {
      console.log(`${colors.green}✓${colors.reset} ${pkg}: ${colors.dim}${tagPrefix}${currentVersion}${colors.reset} → ${colors.bright}${tagPrefix}${nextVersion}${colors.reset}`);
    });
  } else {
    console.log(`${colors.yellow}⚠ No version updates needed${colors.reset}`);
  }

  // Detailed Changes
  printSection('🔍 Detailed Changes:');
  if (packageChanges.size > 0) {
    packageChanges.forEach((changes, pkg) => {
      console.log(`\n${colors.cyan}${pkg}${colors.reset}:`);
      changes.forEach(({ hash, message, reasons }) => {
        console.log(`  ${colors.green}•${colors.reset} ${formatCommit(hash, message)}`);
        reasons.forEach(reason => {
          console.log(`    ${colors.dim}↳ ${reason}${colors.reset}`);
        });
      });
    });
  } else {
    console.log(`${colors.yellow}⚠ No detailed changes to show${colors.reset}`);
  }

  console.log('\n' + colors.dim + '=' .repeat(50) + colors.reset + '\n');
}

// Export functions for testing
export {
  getLastTag,
  getCurrentVersion,
  determineNextVersion,
  getNextVersion,
  formatCommit,
  printSection,
  getCommitRange,
  checkVersions
};

// Function to check versions
function checkVersions(isCI = false) {
  try {
    // Set json output based on CI environment
    jsonOutput = isCI;
    
    // Process each package's changes and determine version updates
    config.versionedPackages.forEach(pkg => {
      if (packageChanges.has(pkg.name)) {
        const changes = packageChanges.get(pkg.name);
        const currentVersion = getCurrentVersion(pkg.tagPrefix);
        const versionChanges = determineNextVersion(changes);
        const nextVersion = getNextVersion(currentVersion, versionChanges);
        
        if (nextVersion) {
          versionUpdates.set(pkg.name, {
            tagPrefix: pkg.tagPrefix,
            currentVersion,
            nextVersion,
            changes
          });
        }
      }
    });

    // Output results
    if (jsonOutput) {
      const output = {};
      
      config.versionedPackages.forEach(pkg => {
        output[pkg.name] = {
          currentVersion: getCurrentVersion(pkg.tagPrefix),
          nextVersion: versionUpdates.has(pkg.name) ? versionUpdates.get(pkg.name).nextVersion : null,
          hasChanges: packageChanges.has(pkg.name)
        };
      });
      
      console.log(JSON.stringify(output));
    } else {
      console.log('\n' + colors.bright + colors.magenta + '🚀 Release Check Summary' + colors.reset + '\n');
      console.log(colors.dim + '=' .repeat(50) + colors.reset + '\n');

      // Changes Overview
      printSection('📦 Changes Detected:');
      if (packageChanges.size > 0) {
        packageChanges.forEach((changes, pkg) => {
          console.log(`${colors.green}✓${colors.reset} ${pkg}: ${colors.cyan}${changes.size}${colors.reset} commits`);
        });
      } else {
        console.log(`${colors.yellow}⚠ No changes detected${colors.reset}`);
      }

      // Version Updates
      printSection('📝 Version Updates:');
      if (versionUpdates.size > 0) {
        versionUpdates.forEach(({ tagPrefix, currentVersion, nextVersion }, pkg) => {
          console.log(`${colors.green}✓${colors.reset} ${pkg}: ${colors.dim}${tagPrefix}${currentVersion}${colors.reset} → ${colors.bright}${tagPrefix}${nextVersion}${colors.reset}`);
        });
      } else {
        console.log(`${colors.yellow}⚠ No version updates needed${colors.reset}`);
      }

      // Detailed Changes
      printSection('🔍 Detailed Changes:');
      if (packageChanges.size > 0) {
        packageChanges.forEach((changes, pkg) => {
          console.log(`\n${colors.cyan}${pkg}${colors.reset}:`);
          changes.forEach(({ hash, message, reasons }) => {
            console.log(`  ${colors.green}•${colors.reset} ${formatCommit(hash, message)}`);
            reasons.forEach(reason => {
              console.log(`    ${colors.dim}↳ ${reason}${colors.reset}`);
            });
          });
        });
      } else {
        console.log(`${colors.yellow}⚠ No detailed changes to show${colors.reset}`);
      }

      console.log('\n' + colors.dim + '=' .repeat(50) + colors.reset + '\n');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Main execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkVersions(process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true');
}
