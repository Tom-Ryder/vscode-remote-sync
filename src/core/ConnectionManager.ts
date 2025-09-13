import type { ConnectionConfig, SyncConfig, SyncResult, SyncTrigger } from '../types';
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
      throw new Error('No active connection for workspace');
    }

    if (this.activeOperations.has(workspaceFolder)) {
      throw new Error('Sync already in progress');
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
    const delays = [1000, 2000, 4000];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastResult = await executor.execute(dryRun);

      if (lastResult.success) {
        return lastResult;
      }

      if (attempt < maxRetries) {
        await this.delay(delays[attempt] || 4000);
      }
    }

    return lastResult!;
  }

  private updateConnectionState(workspaceFolder: string, state: ConnectionState): void {
    this.connections.set(workspaceFolder, state);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getFailureCount(workspaceFolder: string): number {
    return this.connections.get(workspaceFolder)?.failureCount ?? 0;
  }

  getLastSyncTime(workspaceFolder: string): Date | undefined {
    return this.connections.get(workspaceFolder)?.lastSyncTime;
  }
}
