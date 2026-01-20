#!/bin/bash
# vif prerequisite checker

set -e

echo "Checking vif prerequisites..."
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✓ Node.js $NODE_VERSION"
else
    echo "✗ Node.js not found (required)"
    exit 1
fi

# Check if vif is installed (global or local)
if command -v vif &> /dev/null; then
    echo "✓ vif CLI installed (global)"
elif [ -f "./dist/cli.js" ]; then
    echo "✓ vif CLI available (local build)"
elif [ -f "$(dirname "$0")/../../../dist/cli.js" ]; then
    echo "✓ vif CLI available (local build)"
else
    echo "✗ vif not found - install with: pnpm add -g @arach/vif"
    exit 1
fi

# Check if vif-mcp is available
if command -v vif-mcp &> /dev/null; then
    echo "✓ vif-mcp available (global)"
elif [ -f "./dist/mcp/server.js" ]; then
    echo "✓ vif-mcp available (local build)"
elif [ -f "$(dirname "$0")/../../../dist/mcp/server.js" ]; then
    echo "✓ vif-mcp available (local build)"
else
    echo "✗ vif-mcp not found"
    exit 1
fi

# Check if server is running
if curl -s -o /dev/null -w "%{http_code}" http://localhost:7850 2>/dev/null | grep -q "000\|101"; then
    # WebSocket returns 101 or connection refused (000) if not running
    if lsof -i :7850 &> /dev/null; then
        echo "✓ vif server running on :7850"
    else
        echo "○ vif server not running (start with: vif serve)"
    fi
else
    echo "○ vif server not running (start with: vif serve)"
fi

# Check ffmpeg (optional)
if command -v ffmpeg &> /dev/null; then
    echo "✓ ffmpeg available (video processing)"
else
    echo "○ ffmpeg not found (optional, for video processing)"
fi

# Check Chrome (optional, for browser automation)
if [ -d "/Applications/Google Chrome.app" ]; then
    echo "✓ Chrome installed (browser automation)"
else
    echo "○ Chrome not found (optional, for browser automation)"
fi

echo ""
echo "Prerequisites check complete."
