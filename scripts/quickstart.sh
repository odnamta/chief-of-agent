#!/bin/bash
set -e

# Chief of Agent — Quickstart
# One command to install everything.
# Usage: curl -fsSL https://raw.githubusercontent.com/odnamta/chief-of-agent/main/scripts/quickstart.sh | bash

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Chief of Agent — Quickstart      ║"
echo "  ║   Agent governance for Claude Code   ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Check prerequisites
if ! command -v node &> /dev/null; then
    echo "  ✗ Node.js not found. Install from https://nodejs.org (v18+)"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  ✗ Node.js $NODE_VERSION found, but v18+ required"
    exit 1
fi
echo "  ✓ Node.js $(node -v)"

if ! command -v claude &> /dev/null; then
    echo "  ⚠ Claude Code CLI not found — install it first: npm install -g @anthropic-ai/claude-code"
    echo "    (Continuing anyway — hooks will work once claude is installed)"
fi

# Step 1: Install CLI
echo ""
echo "  ── Step 1: Install CLI ──"
npm install -g chief-of-agent
echo "  ✓ CLI installed"

# Step 2: Setup hooks + policies
echo ""
echo "  ── Step 2: Configure hooks ──"

# Check if macOS and Swift available for HTTP mode
if [[ "$OSTYPE" == "darwin"* ]] && command -v swift &> /dev/null; then
    echo "  macOS + Swift detected — using HTTP hooks (fastest)"
    chief-of-agent setup --http --auto
    SETUP_MODE="http"
else
    echo "  Using dashboard hooks"
    chief-of-agent setup --dashboard --auto
    SETUP_MODE="dashboard"
fi
echo "  ✓ Hooks installed"

# Step 3: Build macOS app (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]] && command -v swift &> /dev/null; then
    echo ""
    echo "  ── Step 3: Build macOS menu bar app ──"

    # Clone if not already in the repo
    if [ -f "scripts/install-macos.sh" ]; then
        bash scripts/install-macos.sh
    elif [ -f "macos/Package.swift" ]; then
        cd macos && swift build -c release && cd ..
        bash scripts/install-macos.sh
    else
        echo "  ⚠ Run this from the chief-of-agent repo root to build the macOS app"
        echo "    Or: git clone https://github.com/odnamta/chief-of-agent && cd chief-of-agent && bash scripts/install-macos.sh"
    fi
fi

# Done
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║          Setup Complete!             ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

if [ "$SETUP_MODE" = "http" ]; then
    echo "  Next: Launch 'Chief of Agent' from ~/Applications"
    echo "        Then start a Claude Code session:"
    echo "        $ claude"
else
    echo "  Next: Start the dashboard:"
    echo "        $ cd dashboard && npm run dev"
    echo "        Then open http://localhost:3400"
fi

echo ""
echo "  Useful commands:"
echo "    chief-of-agent status    — see active sessions"
echo "    chief-of-agent audit     — view decision log"
echo "    chief-of-agent suggest   — get rule recommendations"
echo "    chief-of-agent uninstall — remove hooks"
echo ""
