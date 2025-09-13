# Change Log

## [0.3.1] - 2025-09-13

### Documentation
- Clarified default .gitignore behavior in README
- Updated package description to highlight zero-config feature

## [0.3.0] - 2025-09-13

### Changed
- Default behavior now respects .gitignore for triggering syncs
- Removed default excludePatterns (*.log, *.tmp) - gitignore handles this now
- Sync triggers automatically exclude files in .gitignore
- If no .gitignore exists, syncs all files as before

### Added
- GitignoreParser utility for proper gitignore pattern matching
- Automatic refresh of gitignore patterns when .gitignore is modified
- Clear documentation of default .gitignore behavior

## [0.2.0] - 2025-09-13

### Improved
- Enhanced code quality with proper utility modules
- Replaced magic numbers with named constants
- Fixed SSH config parser with proper ES module imports
- Implemented safe JSON parsing throughout
- Enhanced path validation with comprehensive checks
- Added custom error classes for better error handling
- Improved type safety across the codebase
- All tests passing with better test coverage

### Fixed
- Removed unsafe non-null assertions in tests
- Fixed type issues with ssh-config module
- Cleaned up repository (removed empty files)

## [0.1.0] - 2025-09-13

Initial release

- File synchronization via SSH/rsync
- SSH config host discovery
- Pattern-based file triggers
- Debounced sync operations
- Retry with exponential backoff
- Per-workspace configuration
- .gitignore support