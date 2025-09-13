# Development

## Setup

```bash
git clone <repository>
cd vscode_rsync
npm install
```

## Build

```bash
npm run compile
npm run watch
```

## Test

```bash
npm test
npm run lint
npm run format
```

## Debug

1. Open in VS Code
2. Press F5
3. Test in Extension Development Host

## Package

```bash
npm install -g @vscode/vsce
vsce package
```

## Project Structure

```
src/
├── core/           # Business logic
├── providers/      # VS Code integration
├── ui/            # UI components
├── commands/      # Command implementations
├── types/         # TypeScript definitions
├── test/          # Test suite
└── extension.ts   # Entry point
```