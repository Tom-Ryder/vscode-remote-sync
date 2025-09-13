#!/bin/bash

set -e

echo "Remote Sync Extension Build"
echo "==========================="

if ! command -v node &> /dev/null; then
    echo "Node.js required. Install from https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "npm required."
    exit 1
fi

if ! command -v rsync &> /dev/null; then
    echo "Warning: rsync not installed"
fi

echo "Installing dependencies..."
npm install

echo "Compiling TypeScript..."
npm run compile

echo "Running tests..."
npm test || echo "Tests require VS Code environment"

echo "Build complete"