#!/usr/bin/env node
/**
 * postinstall script for vif
 *
 * Downloads and installs Vif Agent.app for the current platform.
 * The agent handles cursor, keyboard, and typing overlays for demos.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

const VIF_HOME = path.join(os.homedir(), '.vif');
const AGENT_PATH = path.join(VIF_HOME, 'Vif Agent.app');
const VERSION = require('../package.json').version;

// GitHub release URL (update org/repo as needed)
const RELEASE_BASE = 'https://github.com/anthropics/vif/releases/download';

async function main() {
  // Only install on macOS for now
  if (process.platform !== 'darwin') {
    console.log('vif-agent: Skipping binary install (not macOS)');
    return;
  }

  console.log('vif: Installing Vif Agent...');

  // Create ~/.vif directory
  if (!fs.existsSync(VIF_HOME)) {
    fs.mkdirSync(VIF_HOME, { recursive: true });
  }

  // Check if we have a local build (development mode)
  const localBuild = path.join(__dirname, '..', 'dist', 'Vif Agent.app');
  if (fs.existsSync(localBuild)) {
    console.log('vif: Using local build');
    copyDir(localBuild, AGENT_PATH);
    console.log(`vif: Installed to ${AGENT_PATH}`);
    return;
  }

  // Download from GitHub releases
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const zipUrl = `${RELEASE_BASE}/v${VERSION}/vif-agent-darwin-${arch}.zip`;
  const zipPath = path.join(VIF_HOME, 'agent.zip');

  try {
    console.log(`vif: Downloading from ${zipUrl}`);
    await download(zipUrl, zipPath);

    // Extract
    console.log('vif: Extracting...');
    execSync(`unzip -o -q "${zipPath}" -d "${VIF_HOME}"`, { stdio: 'pipe' });
    fs.unlinkSync(zipPath);

    // Make executable
    const binary = path.join(AGENT_PATH, 'Contents', 'MacOS', 'vif-agent');
    if (fs.existsSync(binary)) {
      fs.chmodSync(binary, 0o755);
    }

    console.log(`vif: Installed to ${AGENT_PATH}`);
  } catch (err) {
    // Don't fail the install if download fails - agent is optional
    console.log(`vif: Could not download agent (${err.message})`);
    console.log('vif: Demo features will be limited. Run "vif install-agent" to retry.');
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function copyDir(src, dest) {
  // Remove existing
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  // Use cp -R for simplicity
  execSync(`cp -R "${src}" "${dest}"`, { stdio: 'pipe' });
}

main().catch(err => {
  console.error('vif postinstall error:', err.message);
  // Don't exit with error - agent is optional
});
