#!/bin/bash
# Wrapper script to run vif serve with fnm-managed node

# fnm is at /opt/homebrew/bin
export PATH="/opt/homebrew/bin:$PATH"
eval "$(/opt/homebrew/bin/fnm env)"

cd /Users/arach/dev/vif
exec node dist/cli.js serve
