import { minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';
import type { TriggerConfig } from '../types';

export class FileSyncManager {
  private readonly pendingSyncs = new Map<string, NodeJS.Timeout>();
  private readonly syncCallbacks = new Map<string, () => void>();

  constructor(private readonly debounceMs: number) {}

  registerWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    _triggerConfig: TriggerConfig,
    onSync: () => void,
  ): void {
    this.syncCallbacks.set(workspaceFolder.uri.fsPath, onSync);
  }

  unregisterWorkspace(workspaceFolder: vscode.WorkspaceFolder): void {
    const key = workspaceFolder.uri.fsPath;
    const timeout = this.pendingSyncs.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingSyncs.delete(key);
    }
    this.syncCallbacks.delete(key);
  }

  handleSave(document: vscode.TextDocument, triggerConfig: TriggerConfig): void {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return;
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
  }
}
