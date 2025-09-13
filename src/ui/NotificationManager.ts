import * as vscode from 'vscode';
import type { SyncResult, UIConfig } from '../types';

export class NotificationManager {
  showSyncSuccess(result: SyncResult, workspaceName: string, config: UIConfig): void {
    if (!config.showNotifications || config.notificationLevel === 'errors-only') {
      return;
    }

    const message = this.formatSuccessMessage(result, workspaceName);
    void vscode.window.showInformationMessage(message);
  }

  async showSyncError(
    result: SyncResult,
    workspaceName: string,
    config: UIConfig,
  ): Promise<'retry' | 'reconfigure' | 'disable' | undefined> {
    if (!config.showNotifications) {
      return undefined;
    }

    const message = this.formatErrorMessage(result, workspaceName);

    return (await vscode.window.showErrorMessage(
      message,
      'Retry',
      'Reconfigure',
      'Disable Sync',
    )) as 'retry' | 'reconfigure' | 'disable' | undefined;
  }

  async promptForInitialSync(host: string, remotePath: string): Promise<boolean> {
    const result = await vscode.window.showInformationMessage(
      `Perform initial sync to ${host}:${remotePath}?`,
      { modal: true },
      'Yes',
      'Skip',
    );

    return result === 'Yes';
  }

  async promptForConnection(): Promise<'configure' | 'never' | undefined> {
    const result = await vscode.window.showInformationMessage(
      'Configure remote sync for this workspace?',
      'Configure',
      'Not Now',
      'Never for this workspace',
    );

    if (result === 'Never for this workspace') {
      return 'never';
    }

    return result === 'Configure' ? 'configure' : undefined;
  }

  showConnectionLost(host: string): void {
    void vscode.window
      .showErrorMessage(
        `Lost connection to ${host}. Please check your SSH connection.`,
        'Reconfigure',
        'Dismiss',
      )
      .then((choice) => {
        if (choice === 'Reconfigure') {
          void vscode.commands.executeCommand('remote-sync.configure');
        }
      });
  }

  private formatSuccessMessage(result: SyncResult, workspaceName: string): string {
    const duration = (result.duration / 1000).toFixed(1);
    return `Synced ${workspaceName} (${result.filesTransferred} files in ${duration}s)`;
  }

  private formatErrorMessage(result: SyncResult, workspaceName: string): string {
    const errorDetail = result.error?.message || 'Unknown error';
    return `Sync failed for ${workspaceName}: ${errorDetail}`;
  }
}
