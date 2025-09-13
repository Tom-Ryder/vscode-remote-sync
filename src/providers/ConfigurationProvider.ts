import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type {
  ConnectionConfig,
  SyncConfig,
  TriggerConfig,
  UIConfig,
  WorkspaceConfig,
} from '../types';
import { delay, parseJsonSafe, SYNC_CONSTANTS } from '../utils';

export class ConfigurationProvider {
  private static readonly CONFIG_SECTION = 'remote-sync';

  getWorkspaceConfig(workspaceFolder: vscode.WorkspaceFolder): WorkspaceConfig {
    const config = vscode.workspace.getConfiguration(
      ConfigurationProvider.CONFIG_SECTION,
      workspaceFolder.uri,
    );

    return {
      connection: this.getConnectionConfig(config),
      sync: this.getSyncConfig(config),
      triggers: this.getTriggerConfig(config),
      ui: this.getUIConfig(config),
      advanced: {
        debounceMs: config.get<number>('advanced.debounceMs', SYNC_CONSTANTS.DEFAULT_DEBOUNCE_MS),
      },
    };
  }

  async updateConnectionConfig(
    workspaceFolder: vscode.WorkspaceFolder,
    connection: Partial<ConnectionConfig>,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      ConfigurationProvider.CONFIG_SECTION,
      workspaceFolder.uri,
    );

    const updates: Array<Thenable<void>> = [];

    if (connection.host !== undefined) {
      updates.push(
        config.update(
          'connection.host',
          connection.host,
          vscode.ConfigurationTarget.WorkspaceFolder,
        ),
      );
    }

    if (connection.remotePath !== undefined) {
      updates.push(
        config.update(
          'connection.remotePath',
          connection.remotePath,
          vscode.ConfigurationTarget.WorkspaceFolder,
        ),
      );
    }

    if (connection.enabled !== undefined) {
      updates.push(
        config.update(
          'connection.enabled',
          connection.enabled,
          vscode.ConfigurationTarget.WorkspaceFolder,
        ),
      );
    }

    await Promise.all(updates);

    await delay(SYNC_CONSTANTS.CONFIG_PERSIST_DELAY_MS);

    try {
      await this.persistWorkspaceSettings(workspaceFolder, connection);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async persistWorkspaceSettings(
    workspaceFolder: vscode.WorkspaceFolder,
    connection: Partial<ConnectionConfig>,
  ): Promise<void> {
    const settingsPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'settings.json');
    const settingsDir = path.dirname(settingsPath);

    await fs.mkdir(settingsDir, { recursive: true });

    let current: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(settingsPath, 'utf8');
      const parsed = parseJsonSafe<Record<string, unknown>>(content);
      if (parsed) {
        current = parsed;
      }
    } catch {
      current = {};
    }

    if (connection.host !== undefined) {
      current['remote-sync.connection.host'] = connection.host;
    }
    if (connection.remotePath !== undefined) {
      current['remote-sync.connection.remotePath'] = connection.remotePath;
    }
    if (connection.enabled !== undefined) {
      current['remote-sync.connection.enabled'] = connection.enabled;
    }

    await fs.writeFile(settingsPath, JSON.stringify(current, null, 2), 'utf8');
  }

  private getConnectionConfig(config: vscode.WorkspaceConfiguration): ConnectionConfig {
    return {
      host: config.get<string>('connection.host', ''),
      remotePath: config.get<string>('connection.remotePath', ''),
      enabled: config.get<boolean>('connection.enabled', false),
    };
  }

  private getSyncConfig(config: vscode.WorkspaceConfiguration): SyncConfig {
    return {
      deleteExtraneous: config.get<boolean>('sync.deleteExtraneous', true),
      useGitignore: config.get<boolean>('sync.useGitignore', true),
      additionalExcludes: config.get<string[]>('sync.additionalExcludes', [
        'node_modules',
        '__pycache__',
        '.DS_Store',
      ]),
      retryCount: config.get<number>('sync.retryCount', 3),
    };
  }

  private getTriggerConfig(config: vscode.WorkspaceConfiguration): TriggerConfig {
    return {
      patterns: config.get<string[]>('triggers.patterns', ['*']),
      excludePatterns: config.get<string[]>('triggers.excludePatterns', ['*.log', '*.tmp']),
    };
  }

  private getUIConfig(config: vscode.WorkspaceConfiguration): UIConfig {
    return {
      showNotifications: config.get<boolean>('ui.showNotifications', true),
      notificationLevel: config.get<'all' | 'errors-only'>('ui.notificationLevel', 'errors-only'),
    };
  }

  onConfigurationChanged(
    callback: (workspaceFolder: vscode.WorkspaceFolder) => void,
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(ConfigurationProvider.CONFIG_SECTION)) {
        return;
      }

      for (const folder of vscode.workspace.workspaceFolders || []) {
        if (event.affectsConfiguration(ConfigurationProvider.CONFIG_SECTION, folder.uri)) {
          callback(folder);
        }
      }
    });
  }
}
