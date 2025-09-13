# Testing

## Test Results

34 tests passing
0 linting errors
Full TypeScript compilation

## Run Tests

```bash
npm test
npm run lint
npm run compile
```

## Manual Testing

### Setup
1. Open project: `code /Users/tryder/Documents/vscode_rsync`
2. Press F5 to launch Extension Development Host
3. Open any folder in new VS Code window
4. Save a file to trigger setup

### Configuration
- Select SSH host from ~/.ssh/config
- Enter remote path (must start with /)
- Saves to .vscode/settings.json

### Features

#### File Sync
- Edit file → Save → Syncs to remote
- Status bar shows sync status

#### Patterns
```json
{
  "remote-sync.triggers.patterns": ["*.py", "*.yaml"],
  "remote-sync.triggers.excludePatterns": ["*.log"]
}
```

#### Commands (Cmd+Shift+P)
- Remote Sync: Configure Connection
- Remote Sync: Sync Now
- Remote Sync: Dry Run
- Remote Sync: Show Sync Log
- Remote Sync: Disable for Workspace

### Error Handling
- 3 automatic retries with exponential backoff
- Connection failure shows retry/reconfigure/disable options

## Test Coverage

- SshConfigParser: 7 tests
- RsyncExecutor: 8 tests  
- FileSyncManager: 9 tests
- ConnectionManager: 10 tests

## Demo Environment

```bash
./demo.sh
```

Creates test directories at ~/demo-remote-sync/

## Verify Sync

```bash
ls -la ~/demo-remote-sync/remote/
diff -r ~/demo-remote-sync/local ~/demo-remote-sync/remote
```