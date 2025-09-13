import type { ConnectionConfig, SyncConfig, SyncResult, SyncTrigger } from '../types';
import { ConnectionError, delay, ERROR_CODES, SYNC_CONSTANTS } from '../utils';
import { RsyncExecutor } from './RsyncExecutor';

interface ConnectionState {
  readonly config: ConnectionConfig;
  readonly lastSyncTime?: Date;
  readonly failureCount: number;
}

export class ConnectionManager {
  private readonly connections = new Map<string, ConnectionState>();
  private readonly activeOperations = new Set<string>();

  getConnection(workspaceFolder: string): ConnectionState | undefined {
    return this.connections.get(workspaceFolder);
  }

  setConnection(workspaceFolder: string, config: ConnectionConfig): void {
    this.connections.set(workspaceFolder, {
      config,
      failureCount: 0,
    });
  }

  removeConnection(workspaceFolder: string): void {
    this.connections.delete(workspaceFolder);
    this.activeOperations.delete(workspaceFolder);
  }

  isActive(workspaceFolder: string): boolean {
    return this.activeOperations.has(workspaceFolder);
  }

  async sync(
    workspaceFolder: string,
    syncConfig: SyncConfig,
    _trigger: SyncTrigger,
    dryRun = false,
  ): Promise<SyncResult> {
    const state = this.connections.get(workspaceFolder);
    if (!state || !state.config.enabled) {
      throw new ConnectionError('No active connection for workspace', ERROR_CODES.NO_CONNECTION);
    }

    if (this.activeOperations.has(workspaceFolder)) {
      throw new ConnectionError('Sync already in progress', ERROR_CODES.SYNC_IN_PROGRESS);
    }

    this.activeOperations.add(workspaceFolder);

    try {
      const executor = new RsyncExecutor(workspaceFolder, state.config, syncConfig);
      const result = await this.executeWithRetry(executor, syncConfig.retryCount, dryRun);

      if (result.success) {
        this.updateConnectionState(workspaceFolder, {
          ...state,
          lastSyncTime: new Date(),
          failureCount: 0,
        });
      } else {
        this.updateConnectionState(workspaceFolder, {
          ...state,
          failureCount: state.failureCount + 1,
        });
      }

      return result;
    } finally {
      this.activeOperations.delete(workspaceFolder);
    }
  }

  private async executeWithRetry(
    executor: RsyncExecutor,
    maxRetries: number,
    dryRun: boolean,
  ): Promise<SyncResult> {
    let lastResult: SyncResult | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastResult = await executor.execute(dryRun);

      if (lastResult.success) {
        return lastResult;
      }

      if (attempt < maxRetries) {
        const delayMs =
          SYNC_CONSTANTS.RETRY_DELAYS_MS[attempt] || SYNC_CONSTANTS.RETRY_DELAYS_MS[2];
        await delay(delayMs);
      }
    }

    if (!lastResult) {
      throw new Error('No sync attempts were made');
    }
    return lastResult;
  }

  private updateConnectionState(workspaceFolder: string, state: ConnectionState): void {
    this.connections.set(workspaceFolder, state);
  }

  getFailureCount(workspaceFolder: string): number {
    return this.connections.get(workspaceFolder)?.failureCount ?? 0;
  }

  getLastSyncTime(workspaceFolder: string): Date | undefined {
    return this.connections.get(workspaceFolder)?.lastSyncTime;
  }
}
