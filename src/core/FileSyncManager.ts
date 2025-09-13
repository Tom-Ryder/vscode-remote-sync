import { minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';
import type { TriggerConfig } from '../types';
import { GitignoreParser } from '../utils';

export class FileSyncManager {
  private readonly pendingSyncs = new Map<string, NodeJS.Timeout>();
  private readonly syncCallbacks = new Map<string, () => void>();
  private readonly gitignoreParsers = new Map<string, GitignoreParser | null>();

  constructor(private readonly debounceMs: number) {}

  async registerWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    _triggerConfig: TriggerConfig,
    onSync: () => void,
  ): Promise<void> {
    this.syncCallbacks.set(workspaceFolder.uri.fsPath, onSync);
    const parser = await GitignoreParser.load(workspaceFolder.uri.fsPath);
    this.gitignoreParsers.set(workspaceFolder.uri.fsPath, parser);
  }

  unregisterWorkspace(workspaceFolder: vscode.WorkspaceFolder): void {
    const key = workspaceFolder.uri.fsPath;
    const timeout = this.pendingSyncs.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingSyncs.delete(key);
    }
    this.syncCallbacks.delete(key);
    this.gitignoreParsers.delete(key);
  }

  async handleSave(document: vscode.TextDocument, triggerConfig: TriggerConfig): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return;
    }

    if (document.fileName.endsWith('.gitignore')) {
      const parser = await GitignoreParser.load(workspaceFolder.uri.fsPath);
      this.gitignoreParsers.set(workspaceFolder.uri.fsPath, parser);
    }

    if (!this.shouldTriggerSync(document, workspaceFolder, triggerConfig)) {
      return;
    }

    this.scheduleSync(workspaceFolder);
  }

  private shouldTriggerSync(
    document: vscode.TextDocument,
    workspaceFolder: vscode.WorkspaceFolder,
    triggerConfig: TriggerConfig,
  ): boolean {
    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

    const gitignoreParser = this.gitignoreParsers.get(workspaceFolder.uri.fsPath);
    if (gitignoreParser && gitignoreParser.isIgnored(relativePath)) {
      return false;
    }

    for (const excludePattern of triggerConfig.excludePatterns) {
      if (minimatch(relativePath, excludePattern)) {
        return false;
      }
    }

    if (triggerConfig.patterns.includes('*')) {
      return true;
    }

    for (const pattern of triggerConfig.patterns) {
      if (minimatch(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  private scheduleSync(workspaceFolder: vscode.WorkspaceFolder): void {
    const key = workspaceFolder.uri.fsPath;

    const existingTimeout = this.pendingSyncs.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.pendingSyncs.delete(key);
      const callback = this.syncCallbacks.get(key);
      if (callback) {
        callback();
      }
    }, this.debounceMs);

    this.pendingSyncs.set(key, timeout);
  }

  dispose(): void {
    for (const timeout of this.pendingSyncs.values()) {
      clearTimeout(timeout);
    }
    this.pendingSyncs.clear();
    this.syncCallbacks.clear();
    this.gitignoreParsers.clear();
  }
}
