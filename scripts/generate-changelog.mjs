#!/usr/bin/env node

import fs from 'fs';

const REPO = 'sdkasper/lean-obsidian-terminal';
const API_URL = `https://api.github.com/repos/${REPO}/releases`;
const TOKEN = process.env.GITHUB_TOKEN;

/**
 * Fetch all releases from GitHub API.
 * Uses per_page=100 to get all releases in one request.
 */
async function fetchReleases() {
  const url = new URL(API_URL);
  url.searchParams.set('per_page', '100');

  const options = {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'lean-obsidian-terminal-changelog-generator',
    },
  };

  if (TOKEN) {
    options.headers['Authorization'] = `token ${TOKEN}`;
  }

  const res = await fetch(url.toString(), options);
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Parse a release body and categorize entries.
 * Infers categories from keywords:
 * - "fix:", "bug:", "fixed" -> Bug fixes
 * - "add:", "new:", "feat:", "feature:" -> New
 * - Everything else -> Improvements
 */
function parseReleaseBody(body) {
  if (!body || body.trim() === '') {
    return { new: [], improvements: [], bugfixes: [] };
  }

  const lines = body.split('\n');
  const entries = { new: [], improvements: [], bugfixes: [] };

  for (const line of lines) {
    // Skip section headers, full changelog link, and New Contributors bullets
    if (line.startsWith('## ') || line.startsWith('**Full Changelog')) {
      continue;
    }
    if (line.includes('made their first contribution')) {
      continue;
    }

    // Extract bullet point text
    let text = line.trim();
    if (!text.startsWith('*') && !text.startsWith('-')) {
      continue;
    }

    // Remove bullet marker
    text = text.replace(/^[\*\-]\s+/, '').trim();

    // Strip attribution: " by @username in #123" or " by @username in https://..."
    text = text.replace(/\s+by\s+@[\w\-]+.*$/i, '').trim();

    if (!text) {
      continue;
    }

    // Categorize by keyword
    const lowerText = text.toLowerCase();
    if (lowerText.startsWith('fix') || lowerText.startsWith('bug') || lowerText.includes('fixed')) {
      entries.bugfixes.push(text);
    } else if (
      lowerText.startsWith('add') ||
      lowerText.startsWith('new') ||
      lowerText.startsWith('feat') ||
      lowerText.startsWith('feature')
    ) {
      entries.new.push(text);
    } else {
      entries.improvements.push(text);
    }
  }

  return entries;
}

/**
 * Format a date as "Month DD, YYYY"
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Build the changelog markdown content.
 */
function buildChangelog(releases) {
  let content = '# Changelog\n\n';
  content += 'All notable changes to Lean Obsidian Terminal are documented here.\n\n';

  for (const release of releases) {
    // Only published version releases belong in the changelog
    if (release.draft || release.prerelease) {
      continue;
    }
    const version = release.tag_name;
    const date = formatDate(release.published_at);
    const parsed = parseReleaseBody(release.body);

    content += `## ${version} - ${date}\n\n`;

    // New section
    if (parsed.new.length > 0) {
      content += '### New\n\n';
      for (const entry of parsed.new) {
        content += `- ${entry}\n`;
      }
      content += '\n';
    }

    // Improvements section
    if (parsed.improvements.length > 0) {
      content += '### Improvements\n\n';
      for (const entry of parsed.improvements) {
        content += `- ${entry}\n`;
      }
      content += '\n';
    }

    // Bug fixes section
    if (parsed.bugfixes.length > 0) {
      content += '### Bug fixes\n\n';
      for (const entry of parsed.bugfixes) {
        content += `- ${entry}\n`;
      }
      content += '\n';
    }
  }

  // Footer
  content += `Older releases and more details: [GitHub Releases](https://github.com/${REPO}/releases)\n`;

  return content;
}

/**
 * Main entry point.
 */
async function main() {
  try {
    console.log('Fetching releases from GitHub API...');
    const releases = await fetchReleases();

    if (!Array.isArray(releases) || releases.length === 0) {
      console.error('Error: No releases found');
      process.exit(1);
    }

    console.log(`Found ${releases.length} releases`);

    const changelog = buildChangelog(releases);
    fs.writeFileSync('CHANGELOG.md', changelog, 'utf8');

    console.log('✓ CHANGELOG.md written successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
