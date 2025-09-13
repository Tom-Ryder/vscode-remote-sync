export interface ConnectionConfig {
  readonly host: string;
  readonly remotePath: string;
  readonly enabled: boolean;
}

export interface SyncConfig {
  readonly deleteExtraneous: boolean;
  readonly useGitignore: boolean;
  readonly additionalExcludes: readonly string[];
  readonly retryCount: number;
}

export interface TriggerConfig {
  readonly patterns: readonly string[];
  readonly excludePatterns: readonly string[];
}

export interface UIConfig {
  readonly showNotifications: boolean;
  readonly notificationLevel: 'all' | 'errors-only';
}

export interface WorkspaceConfig {
  readonly connection: ConnectionConfig;
  readonly sync: SyncConfig;
  readonly triggers: TriggerConfig;
  readonly ui: UIConfig;
  readonly advanced: {
    readonly debounceMs: number;
  };
}

export interface SshHost {
  readonly name: string;
  readonly hostname: string;
  readonly user?: string;
  readonly port?: number;
}

export interface SyncResult {
  readonly success: boolean;
  readonly duration: number;
  readonly filesTransferred: number;
  readonly bytesTransferred: number;
  readonly error?: Error;
}

export interface SyncOperation {
  readonly id: string;
  readonly workspaceFolder: string;
  readonly startTime: Date;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly result?: SyncResult;
}

export enum SyncTrigger {
  Manual = 'manual',
  Save = 'save',
  Initial = 'initial',
}

export interface SyncRequest {
  readonly workspaceFolder: string;
  readonly trigger: SyncTrigger;
  readonly dryRun: boolean;
}
