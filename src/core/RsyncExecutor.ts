import { spawn as nodeSpawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ConnectionConfig, SyncConfig, SyncResult } from '../types';

export type SpawnFunction = typeof nodeSpawn;

export interface FileSystem {
  access: (path: string) => Promise<void>;
}

export class RsyncExecutor {
  private static readonly BASE_FLAGS = ['-avz', '--stats'];
  private readonly spawn: SpawnFunction;
  private readonly fs: FileSystem;

  constructor(
    private readonly localPath: string,
    private readonly connection: ConnectionConfig,
    private readonly syncConfig: SyncConfig,
    spawn?: SpawnFunction,
    fileSystem?: FileSystem,
  ) {
    this.spawn = spawn || nodeSpawn;
    this.fs = fileSystem || fs;
  }

  async execute(dryRun = false): Promise<SyncResult> {
    const args = await this.buildArguments(dryRun);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const rsync = this.spawn('rsync', args, {
        cwd: this.localPath,
      });

      let stdout = '';
      let stderr = '';

      rsync.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      rsync.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      rsync.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          const stats = this.parseStats(stdout);
          resolve({
            success: true,
            duration,
            filesTransferred: stats.filesTransferred,
            bytesTransferred: stats.bytesTransferred,
          });
        } else {
          resolve({
            success: false,
            duration,
            filesTransferred: 0,
            bytesTransferred: 0,
            error: new Error(`Rsync failed with code ${code}: ${stderr}`),
          });
        }
      });

      rsync.on('error', (error) => {
        resolve({
          success: false,
          duration: Date.now() - startTime,
          filesTransferred: 0,
          bytesTransferred: 0,
          error,
        });
      });
    });
  }

  private async buildArguments(dryRun: boolean): Promise<string[]> {
    const args = [...RsyncExecutor.BASE_FLAGS];

    if (dryRun) {
      args.push('--dry-run');
    }

    if (this.syncConfig.deleteExtraneous) {
      args.push('--delete');
    }

    args.push('--exclude=.git');

    if (this.syncConfig.useGitignore) {
      const gitignorePath = path.join(this.localPath, '.gitignore');
      if (await this.fileExists(gitignorePath)) {
        args.push(`--exclude-from=${gitignorePath}`);
      }
    }

    for (const pattern of this.syncConfig.additionalExcludes) {
      args.push(`--exclude=${pattern}`);
    }

    const source = this.localPath.endsWith('/') ? this.localPath : `${this.localPath}/`;
    const destination = this.buildDestination();

    args.push(source, destination);

    return args;
  }

  private buildDestination(): string {
    const { host, remotePath } = this.connection;
    return `${host}:${remotePath}`;
  }

  private parseStats(output: string): { filesTransferred: number; bytesTransferred: number } {
    const filesMatch = output.match(/Number of files transferred:\s*(\d+)/);
    const bytesMatch = output.match(/Total transferred file size:\s*([\d,]+)\s*bytes/);

    return {
      filesTransferred: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      bytesTransferred: bytesMatch ? parseInt(bytesMatch[1].replace(/,/g, ''), 10) : 0,
    };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await this.fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
