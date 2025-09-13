import * as vscode from 'vscode';
import type { ConnectionManager } from '../core/ConnectionManager';
import type { ConfigurationProvider } from '../providers/ConfigurationProvider';
import { SyncTrigger } from '../types';
import type { NotificationManager } from '../ui/NotificationManager';
import type { SetupWizard } from '../ui/SetupWizard';
import type { StatusBarManager } from '../ui/StatusBarManager';
import { StatusBarState } from '../ui/StatusBarManager';
import { ensureError } from '../utils';

export class CommandRegistry {
  constructor(
    private readonly setupWizard: SetupWizard,
    private readonly configProvider: ConfigurationProvider,
    private readonly connectionManager: ConnectionManager,
    private readonly notificationManager: NotificationManager,
    private readonly statusBarManager: StatusBarManager,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  registerCommands(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand('remote-sync.configure', () => this.configure()),
      vscode.commands.registerCommand('remote-sync.syncNow', () => this.syncNow()),
      vscode.commands.registerCommand('remote-sync.disable', () => this.disable()),
      vscode.commands.registerCommand('remote-sync.showLog', () => this.showLog()),
      vscode.commands.registerCommand('remote-sync.dryRun', () => this.dryRun()),
    ];
  }

  private async configure(): Promise<void> {
    const workspaceFolder = this.getActiveWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    const currentConfig = this.configProvider.getWorkspaceConfig(workspaceFolder);

    if (currentConfig.connection.enabled && currentConfig.connection.host) {
      const shouldReconfigure = await this.setupWizard.confirmReconfigure(
        currentConfig.connection.host,
      );
      if (!shouldReconfigure) {
        return;
      }
    }

    const newConnection = await this.setupWizard.runSetup();
    if (!newConnection) {
      return;
    }

    await this.configProvider.updateConnectionConfig(workspaceFolder, newConnection);
    this.connectionManager.setConnection(workspaceFolder.uri.fsPath, newConnection);
    this.statusBarManager.setWorkspaceState(
      workspaceFolder,
      StatusBarState.Idle,
      newConnection.host,
    );

    const shouldInitialSync = await this.notificationManager.promptForInitialSync(
      newConnection.host,
      newConnection.remotePath,
    );

    if (shouldInitialSync) {
      await this.performSync(workspaceFolder, SyncTrigger.Initial, false);
    }
  }

  private async syncNow(): Promise<void> {
    const workspaceFolder = this.getActiveWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    await this.performSync(workspaceFolder, SyncTrigger.Manual, false);
  }

  private async disable(): Promise<void> {
    const workspaceFolder = this.getActiveWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    await this.configProvider.updateConnectionConfig(workspaceFolder, { enabled: false });
    this.connectionManager.removeConnection(workspaceFolder.uri.fsPath);
    this.statusBarManager.setWorkspaceState(workspaceFolder, StatusBarState.Disabled);
  }

  private showLog(): void {
    this.outputChannel.show();
  }

  private async dryRun(): Promise<void> {
    const workspaceFolder = this.getActiveWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    await this.performSync(workspaceFolder, SyncTrigger.Manual, true);
  }

  private async performSync(
    workspaceFolder: vscode.WorkspaceFolder,
    trigger: SyncTrigger,
    dryRun: boolean,
  ): Promise<void> {
    const config = this.configProvider.getWorkspaceConfig(workspaceFolder);

    if (!config.connection.enabled) {
      void vscode.window.showWarningMessage('Remote sync is not configured for this workspace');
      return;
    }

    this.statusBarManager.setWorkspaceState(
      workspaceFolder,
      StatusBarState.Syncing,
      config.connection.host,
    );

    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(
      `[${timestamp}] Starting ${dryRun ? 'dry run' : 'sync'} for ${workspaceFolder.name} (${trigger})`,
    );

    try {
      const result = await this.connectionManager.sync(
        workspaceFolder.uri.fsPath,
        config.sync,
        trigger,
        dryRun,
      );

      if (result.success) {
        this.statusBarManager.setWorkspaceState(
          workspaceFolder,
          StatusBarState.Idle,
          config.connection.host,
        );

        const message = `Sync completed: ${result.filesTransferred} files, ${result.bytesTransferred} bytes in ${(result.duration / 1000).toFixed(2)}s`;
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);

        if (!dryRun) {
          this.notificationManager.showSyncSuccess(result, workspaceFolder.name, config.ui);
        } else {
          void vscode.window.showInformationMessage(`Dry run completed: ${message}`);
        }
      } else {
        throw result.error || new Error('Sync failed');
      }
    } catch (error) {
      this.statusBarManager.setWorkspaceState(
        workspaceFolder,
        StatusBarState.Error,
        config.connection.host,
      );

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[${timestamp}] ERROR: ${errorMessage}`);

      const choice = await this.notificationManager.showSyncError(
        {
          success: false,
          duration: 0,
          filesTransferred: 0,
          bytesTransferred: 0,
          error: ensureError(error),
        },
        workspaceFolder.name,
        config.ui,
      );

      if (choice === 'retry') {
        await this.performSync(workspaceFolder, trigger, dryRun);
      } else if (choice === 'reconfigure') {
        await this.configure();
      } else if (choice === 'disable') {
        await this.disable();
      }
    }
  }

  private getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      return vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    }

    return vscode.workspace.workspaceFolders?.[0];
  }
}
