import * as vscode from 'vscode';

export enum StatusBarState {
  Idle = 'idle',
  Syncing = 'syncing',
  Error = 'error',
  Disabled = 'disabled',
}

export class StatusBarManager {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly workspaceStates = new Map<string, StatusBarState>();
  private readonly workspaceHosts = new Map<string, string>();
  private readonly lastSyncTimes = new Map<string, Date>();

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'remote-sync.showLog';
  }

  setWorkspaceState(
    workspaceFolder: vscode.WorkspaceFolder,
    state: StatusBarState,
    host?: string,
  ): void {
    this.workspaceStates.set(workspaceFolder.uri.fsPath, state);

    if (host) {
      this.workspaceHosts.set(workspaceFolder.uri.fsPath, host);
    }

    if (state === StatusBarState.Idle) {
      this.lastSyncTimes.set(workspaceFolder.uri.fsPath, new Date());
    }

    this.updateDisplay();
  }

  removeWorkspace(workspaceFolder: vscode.WorkspaceFolder): void {
    const key = workspaceFolder.uri.fsPath;
    this.workspaceStates.delete(key);
    this.workspaceHosts.delete(key);
    this.lastSyncTimes.delete(key);
    this.updateDisplay();
  }

  private updateDisplay(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      this.statusBarItem.hide();
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (!workspaceFolder) {
      this.statusBarItem.hide();
      return;
    }

    const state = this.workspaceStates.get(workspaceFolder.uri.fsPath);
    const host = this.workspaceHosts.get(workspaceFolder.uri.fsPath);

    if (!state || state === StatusBarState.Disabled) {
      this.statusBarItem.text = '$(sync) Sync disabled';
      this.statusBarItem.tooltip = 'Click to configure remote sync';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = this.getStatusText(state, host);
      this.statusBarItem.tooltip = this.getTooltip(state, workspaceFolder);
      this.statusBarItem.backgroundColor =
        state === StatusBarState.Error
          ? new vscode.ThemeColor('statusBarItem.errorBackground')
          : undefined;
    }

    this.statusBarItem.show();
  }

  private getStatusText(state: StatusBarState, host?: string): string {
    const hostPrefix = host ? `$(remote) ${host}` : '$(sync)';

    switch (state) {
      case StatusBarState.Idle:
        return `${hostPrefix} • ✓ Synced`;
      case StatusBarState.Syncing:
        return `${hostPrefix} • $(sync~spin) Syncing...`;
      case StatusBarState.Error:
        return `${hostPrefix} • $(error) Sync failed`;
      default:
        return `${hostPrefix}`;
    }
  }

  private getTooltip(state: StatusBarState, workspaceFolder: vscode.WorkspaceFolder): string {
    const lastSync = this.lastSyncTimes.get(workspaceFolder.uri.fsPath);

    if (state === StatusBarState.Error) {
      return 'Sync failed. Click for details';
    }

    if (lastSync && state === StatusBarState.Idle) {
      const seconds = Math.floor((Date.now() - lastSync.getTime()) / 1000);
      if (seconds < 60) {
        return `Last synced ${seconds}s ago`;
      }
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) {
        return `Last synced ${minutes}m ago`;
      }
      const hours = Math.floor(minutes / 60);
      return `Last synced ${hours}h ago`;
    }

    return 'Click to view sync log';
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }

  onDidChangeActiveEditor(): void {
    this.updateDisplay();
  }
}
