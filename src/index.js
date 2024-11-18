import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
const CONFIG_PATH = resolve(process.cwd(), 'release-config.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

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
    // For root packages with just 'v', we need to be more careful about the match pattern
    const matchPattern = prefix === 'v' ? 'v[0-9]*' : `${prefix}*`;
    // Redirect stderr to /dev/null to suppress "fatal: No names found" message
    return execSync(`git describe --tags --match "${matchPattern}" --abbrev=0 2>/dev/null`).toString().trim();
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

  if (!jsonOutput) {
    console.log('\n' + colors.yellow + '🔍 Analyzing commits for version bump:' + colors.reset);
  }

  commits.forEach(({ message, breaking }) => {
    const match = message.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:/);
    if (match) {
      const [, type, scope, breakingMark] = match;

      if (!jsonOutput) {
        console.log(colors.dim + '  Type:' + colors.reset, colors.cyan + type + colors.reset);
      }

      if (breaking || breakingMark || message.includes('BREAKING CHANGE:')) {
        major = true;
        if (!jsonOutput) console.log(colors.dim + '  → Major bump (breaking change)' + colors.reset);
      } else if (type === 'feat') {
        minor = true;
        if (!jsonOutput) console.log(colors.dim + '  → Minor bump (new feature)' + colors.reset);
      } else if (type === 'fix') {
        patch = true;
        if (!jsonOutput) console.log(colors.dim + '  → Patch bump (bug fix)' + colors.reset);
      } else {
        if (!jsonOutput) console.log(colors.dim + '  → No bump (non-versioning commit)' + colors.reset);
      }
    }
  });

  if (!jsonOutput) {
    console.log(colors.yellow + '📝 Result:' + colors.reset, colors.dim + 
      (major ? 'Major bump needed' : 
       minor ? 'Minor bump needed' : 
       patch ? 'Patch bump needed' : 
       'No version bump needed') + colors.reset + '\n');
  }

  return { major, minor, patch };
}

function getNextVersion(currentVersion, changes) {
  // Handle both old and new formats
  let bumpType = changes;
  if (typeof changes === 'object') {
    if (changes.major) bumpType = 'major';
    else if (changes.minor) bumpType = 'minor';
    else if (changes.patch) bumpType = 'patch';
  }

  if (!bumpType) return null;

  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  if (bumpType === 'major' || (typeof changes === 'object' && changes.major)) {
    return `${major + 1}.0.0`;
  } else if (bumpType === 'minor' || (typeof changes === 'object' && changes.minor)) {
    return `${major}.${minor + 1}.0`;
  } else if (bumpType === 'patch' || (typeof changes === 'object' && changes.patch)) {
    return `${major}.${minor}.${patch + 1}`;
  }
  
  return null;
}

// Initialize maps to store changes and version updates
const packageChanges = new Map();
const versionUpdates = new Map();
let jsonOutput = false;

// Function to check versions
export function checkVersions(isCI = false) {
  try {
    // Set json output based on CI environment or --json flag
    jsonOutput = isCI || process.argv.includes('--json');
    
    // Clear any existing data
    packageChanges.clear();
    versionUpdates.clear();
    
    // Analyze commits for each package
    config.versionedPackages.forEach(pkg => {
      const range = getCommitRange(pkg.tagPrefix);
      try {
        const commits = execSync(`git log ${range} --format="%H %s"`).toString().trim().split('\n').filter(Boolean);
        if (!jsonOutput) {
          console.log('\n' + colors.cyan + '📦 Package:' + colors.reset, colors.bright + pkg.name + colors.reset);
          console.log(colors.dim + `Found ${commits.length} commits since ${pkg.tagPrefix}` + colors.reset + '\n');
        }
        
        const changes = new Set();
        commits.forEach(commit => {
          if (!commit) return;
          const [hash, ...messageParts] = commit.split(' ');
          const message = messageParts.join(' ');
          
          if (!jsonOutput) {
            console.log(colors.magenta + '🔍 Analyzing:' + colors.reset, colors.dim + hash.slice(0, 7) + colors.reset, '-', colors.bright + message + colors.reset);
          }
          
          // Check if this is a versioning commit (feat, fix, or breaking change)
          const match = message.match(/^([a-z]+)(?:\(([^)]+)\))?(!)?:/);
          if (!match) return;
          
          const [, type, scope, breaking] = match;

          // Consider all feat, fix, and breaking changes
          const isVersioningCommit = type === 'feat' || type === 'fix' || breaking || message.includes('BREAKING CHANGE:');
          if (!isVersioningCommit) {
            if (!jsonOutput) {
              console.log(colors.dim + '  → Skipping non-versioning commit' + colors.reset);
            }
            return;
          }
          
          // Add the commit regardless of file changes for version determination
          changes.add({
            hash,
            message,
            type,
            breaking: breaking || message.includes('BREAKING CHANGE:'),
            reasons: ['Versioning commit detected']
          });

          // Get changed files in this commit for informational purposes
          const changedFiles = execSync(`git diff-tree --no-commit-id --name-only -r ${hash}`).toString().trim();
          const changedFilesList = changedFiles.split('\n');

          if (!jsonOutput) {
            const changedFilesCount = changedFilesList.length;
            console.log(colors.dim + `  Changed files: ${changedFilesCount}` + colors.reset);
          }

          // Add additional reasons if files match package criteria
          const reasons = [];

          // If it's a root package or no directory specified, all changes are relevant
          if (!pkg.directory || pkg.directory === '.') {
            reasons.push('Root package - considering all changes');
          } else {
            // For non-root packages, check if files are in the package directory
            if (changedFilesList.some(file => {
              const normalizedFile = file.replace(/\\/g, '/');
              const normalizedDir = pkg.directory.replace(/\\/g, '/');
              // For root directory ('.'), any file is considered a match
              return normalizedDir === '.' ? true : (normalizedFile.startsWith(normalizedDir + '/') || normalizedFile === normalizedDir);
            })) {
              reasons.push(`Direct changes in ${pkg.directory}`);
            }

            // Check if commit is scoped to this package
            if (scope === pkg.name) {
              reasons.push(`Commit scoped to ${pkg.name}`);
            }

            // Check dependencies
            if (pkg.dependsOn) {
              pkg.dependsOn.forEach(dep => {
                const depPattern = dep.replace('*', '');
                const matchingChanges = changedFilesList.filter(file => {
                  const normalizedFile = file.replace(/\\/g, '/');
                  const normalizedPattern = depPattern.replace(/\\/g, '/');
                  return normalizedFile.startsWith(normalizedPattern + '/') || normalizedFile === normalizedPattern;
                });
                if (matchingChanges.length > 0) {
                  reasons.push(`Changes in dependent package ${dep}`);
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
        });
        
        if (changes.size > 0) {
          packageChanges.set(pkg.name, changes);
        }
      } catch (error) {
        if (!jsonOutput) {
          console.log(`No commits found for ${pkg.name} since last tag`);
        }
      }
    });
    
    // Process each package's changes and determine version updates
    config.versionedPackages.forEach(pkg => {
      if (packageChanges.has(pkg.name)) {
        const changes = Array.from(packageChanges.get(pkg.name));
        const currentVersion = getCurrentVersion(pkg.tagPrefix);
        const versionChanges = determineNextVersion(changes);
        let bumpType = null;
        
        if (versionChanges.major) bumpType = 'major';
        else if (versionChanges.minor) bumpType = 'minor';
        else if (versionChanges.patch) bumpType = 'patch';
        
        const nextVersion = getNextVersion(currentVersion, bumpType);
        
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
      return output;
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
      
      const output = {};
      config.versionedPackages.forEach(pkg => {
        output[pkg.name] = {
          currentVersion: getCurrentVersion(pkg.tagPrefix),
          nextVersion: versionUpdates.has(pkg.name) ? versionUpdates.get(pkg.name).nextVersion : null,
          hasChanges: packageChanges.has(pkg.name)
        };
      });
      return output;
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

// Export functions for testing
export {
  getLastTag,
  getCurrentVersion,
  determineNextVersion,
  getNextVersion,
  formatCommit,
  printSection,
  getCommitRange,
};
