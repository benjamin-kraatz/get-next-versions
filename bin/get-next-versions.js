#!/usr/bin/env node

import { checkVersions } from '../dist/index.js';

// Only use JSON output in CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
checkVersions(isCI);
