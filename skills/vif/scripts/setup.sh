#!/bin/bash
# vif setup helper

set -e

echo "Setting up vif..."
echo ""

# Check if pnpm is available, fall back to npm
if command -v pnpm &> /dev/null; then
    PKG_MGR="pnpm"
else
    PKG_MGR="npm"
fi

# Install vif globally if not present
if ! command -v vif &> /dev/null; then
    echo "Installing vif..."
    $PKG_MGR install -g @arach/vif
    echo "✓ vif installed"
else
    echo "✓ vif already installed"
fi

# Check Xcode CLI tools
if ! xcode-select -p &> /dev/null; then
    echo "Installing Xcode Command Line Tools..."
    xcode-select --install
    echo "Please complete the installation and re-run this script."
    exit 0
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the server: vif serve"
echo "  2. Grant permissions in System Settings > Privacy & Security:"
echo "     - Screen Recording: Terminal + Vif Agent"
echo "     - Accessibility: Terminal + Vif Agent"
echo "     - Camera: Vif Agent (for presenter overlay)"
echo ""
