import * as vscode from 'vscode';
import { CommandRegistry } from './commands';
import { ConnectionManager } from './core/ConnectionManager';
import { FileSyncManager } from './core/FileSyncManager';
import { ConfigurationProvider } from './providers/ConfigurationProvider';
import { SyncTrigger } from './types';
import { NotificationManager } from './ui/NotificationManager';
import { SetupWizard } from './ui/SetupWizard';
import { StatusBarManager, StatusBarState } from './ui/StatusBarManager';
import { ensureError, SYNC_CONSTANTS } from './utils';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Remote Sync');
  const configProvider = new ConfigurationProvider();
  const connectionManager = new ConnectionManager();
  const statusBarManager = new StatusBarManager();
  const notificationManager = new NotificationManager();
  const setupWizard = new SetupWizard();

  const commandRegistry = new CommandRegistry(
    setupWizard,
    configProvider,
    connectionManager,
    notificationManager,
    statusBarManager,
    outputChannel,
  );

  const disposables: vscode.Disposable[] = [];

  disposables.push(...commandRegistry.registerCommands());
  disposables.push(outputChannel);
  disposables.push(statusBarManager);

  const fileSyncManagers = new Map<string, FileSyncManager>();
  const firstSaveHandled = new Set<string>();

  const initializeWorkspace = (workspaceFolder: vscode.WorkspaceFolder): void => {
    const config = configProvider.getWorkspaceConfig(workspaceFolder);

    if (config.connection.enabled && config.connection.host) {
      connectionManager.setConnection(workspaceFolder.uri.fsPath, config.connection);
      statusBarManager.setWorkspaceState(
        workspaceFolder,
        StatusBarState.Idle,
        config.connection.host,
      );

      const syncManager = new FileSyncManager(config.advanced.debounceMs);
      void syncManager.registerWorkspace(workspaceFolder, config.triggers, () => {
        void performSync(workspaceFolder, SyncTrigger.Save);
      });

      fileSyncManagers.set(workspaceFolder.uri.fsPath, syncManager);
    } else {
      statusBarManager.setWorkspaceState(workspaceFolder, StatusBarState.Disabled);
    }
  };

  const performSync = async (
    workspaceFolder: vscode.WorkspaceFolder,
    trigger: SyncTrigger,
  ): Promise<void> => {
    const config = configProvider.getWorkspaceConfig(workspaceFolder);

    statusBarManager.setWorkspaceState(
      workspaceFolder,
      StatusBarState.Syncing,
      config.connection.host,
    );

    try {
      const result = await connectionManager.sync(
        workspaceFolder.uri.fsPath,
        config.sync,
        trigger,
        false,
      );

      if (result.success) {
        statusBarManager.setWorkspaceState(
          workspaceFolder,
          StatusBarState.Idle,
          config.connection.host,
        );
        notificationManager.showSyncSuccess(result, workspaceFolder.name, config.ui);
      } else {
        throw result.error || new Error('Sync failed');
      }
    } catch (error) {
      statusBarManager.setWorkspaceState(
        workspaceFolder,
        StatusBarState.Error,
        config.connection.host,
      );

      const failureCount = connectionManager.getFailureCount(workspaceFolder.uri.fsPath);

      if (failureCount >= SYNC_CONSTANTS.MAX_FAILURE_COUNT) {
        notificationManager.showConnectionLost(config.connection.host);
      } else {
        const choice = await notificationManager.showSyncError(
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
          await performSync(workspaceFolder, trigger);
        } else if (choice === 'reconfigure') {
          await vscode.commands.executeCommand('remote-sync.configure');
        } else if (choice === 'disable') {
          await vscode.commands.executeCommand('remote-sync.disable');
        }
      }
    }
  };

  for (const folder of vscode.workspace.workspaceFolders || []) {
    initializeWorkspace(folder);
  }

  disposables.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return;
      }

      const config = configProvider.getWorkspaceConfig(workspaceFolder);

      if (!firstSaveHandled.has(workspaceFolder.uri.fsPath) && !config.connection.enabled) {
        firstSaveHandled.add(workspaceFolder.uri.fsPath);

        void (async (): Promise<void> => {
          const choice = await notificationManager.promptForConnection();
          if (choice === 'configure') {
            await vscode.commands.executeCommand('remote-sync.configure');
          } else if (choice === 'never') {
            await configProvider.updateConnectionConfig(workspaceFolder, { enabled: false });
          }
        })();
        return;
      }

      const syncManager = fileSyncManagers.get(workspaceFolder.uri.fsPath);
      if (syncManager) {
        void syncManager.handleSave(document, config.triggers);
      }
    }),
  );

  disposables.push(
    configProvider.onConfigurationChanged((workspaceFolder) => {
      const existingManager = fileSyncManagers.get(workspaceFolder.uri.fsPath);
      if (existingManager) {
        existingManager.dispose();
        fileSyncManagers.delete(workspaceFolder.uri.fsPath);
      }

      connectionManager.removeConnection(workspaceFolder.uri.fsPath);
      initializeWorkspace(workspaceFolder);
    }),
  );

  disposables.push(
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      for (const folder of event.removed) {
        const manager = fileSyncManagers.get(folder.uri.fsPath);
        if (manager) {
          manager.dispose();
          fileSyncManagers.delete(folder.uri.fsPath);
        }
        connectionManager.removeConnection(folder.uri.fsPath);
        statusBarManager.removeWorkspace(folder);
        firstSaveHandled.delete(folder.uri.fsPath);
      }

      for (const folder of event.added) {
        initializeWorkspace(folder);
      }
    }),
  );

  disposables.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      statusBarManager.onDidChangeActiveEditor();
    }),
  );

  context.subscriptions.push(...disposables);

  context.subscriptions.push({
    dispose: () => {
      for (const manager of fileSyncManagers.values()) {
        manager.dispose();
      }
      fileSyncManagers.clear();
    },
  });
}

export function deactivate(): void {}
