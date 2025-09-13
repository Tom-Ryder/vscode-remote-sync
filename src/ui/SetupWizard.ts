import * as vscode from 'vscode';
import { SshConfigParser } from '../core/SshConfigParser';
import type { ConnectionConfig, SshHost } from '../types';

export class SetupWizard {
  private readonly sshParser = new SshConfigParser();

  async runSetup(): Promise<ConnectionConfig | undefined> {
    const hosts = await this.sshParser.parseHosts();

    if (hosts.length === 0) {
      void vscode.window.showErrorMessage(
        'No SSH hosts found in ~/.ssh/config. Please configure SSH hosts first.',
      );
      return undefined;
    }

    const selectedHost = await this.selectHost(hosts);
    if (!selectedHost) {
      return undefined;
    }

    const remotePath = await this.inputRemotePath();
    if (!remotePath) {
      return undefined;
    }

    return {
      host: selectedHost.name,
      remotePath,
      enabled: true,
    };
  }

  private async selectHost(hosts: SshHost[]): Promise<SshHost | undefined> {
    const items: vscode.QuickPickItem[] = hosts.map((host) => ({
      label: host.name,
      description: this.formatHostDescription(host),
      detail: host.hostname,
    }));

    items.push({
      label: '$(close) None (disable sync)',
      description: 'Do not sync this workspace',
      detail: undefined,
    });

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select SSH Target',
      placeHolder: 'Choose an SSH host from your config',
      ignoreFocusOut: true,
    });

    if (!selected || selected.label.includes('None')) {
      return undefined;
    }

    return hosts.find((h) => h.name === selected.label);
  }

  private formatHostDescription(host: SshHost): string {
    const parts: string[] = [];

    if (host.user) {
      parts.push(`${host.user}@${host.hostname}`);
    } else {
      parts.push(host.hostname);
    }

    if (host.port && host.port !== 22) {
      parts.push(`port ${host.port}`);
    }

    return parts.join(', ');
  }

  private async inputRemotePath(): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({
      title: 'Remote Directory Path',
      prompt: 'Enter the absolute path to the remote directory',
      placeHolder: '/home/user/project',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Path cannot be empty';
        }
        if (!value.startsWith('/')) {
          return 'Path must be absolute (start with /)';
        }
        return undefined;
      },
    });

    return input?.trim();
  }

  async confirmReconfigure(currentHost: string): Promise<boolean> {
    const result = await vscode.window.showWarningMessage(
      `Currently connected to ${currentHost}. Reconfigure connection?`,
      { modal: true },
      'Yes',
      'Cancel',
    );

    return result === 'Yes';
  }
}
