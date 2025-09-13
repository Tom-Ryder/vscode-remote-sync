# Remote Sync

VS Code extension for file synchronization to remote development environments via SSH.

## Features

- Automatic sync on save
- SSH config integration
- Pattern matching for file triggers
- Debounced sync operations
- Retry with exponential backoff
- Per-workspace configuration

## Installation

1. Install from VS Code marketplace
2. Ensure `rsync` is installed locally
3. Configure SSH access to remote servers

## Usage

### Initial Setup
1. Open workspace in VS Code
2. Save any file to trigger setup
3. Select SSH host from ~/.ssh/config
4. Enter remote directory path

### Configuration

`.vscode/settings.json`:
```json
{
  "remote-sync.connection.host": "dev-server",
  "remote-sync.connection.remotePath": "/home/user/project",
  "remote-sync.connection.enabled": true,
  "remote-sync.triggers.patterns": ["*.py", "*.yaml"],
  "remote-sync.triggers.excludePatterns": ["*.log", "*.tmp"],
  "remote-sync.sync.deleteExtraneous": true,
  "remote-sync.sync.useGitignore": true,
  "remote-sync.sync.additionalExcludes": ["node_modules", "__pycache__"]
}
```

### Commands

- `Remote Sync: Configure Connection`
- `Remote Sync: Sync Now`
- `Remote Sync: Dry Run`
- `Remote Sync: Show Sync Log`
- `Remote Sync: Disable for Workspace`

## Requirements

- VS Code 1.85.0+
- rsync
- SSH key authentication

## Development

```bash
npm install
npm run compile
npm test
```

## License

MIT