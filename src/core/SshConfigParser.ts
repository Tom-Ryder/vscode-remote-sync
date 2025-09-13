import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import SSHConfig from 'ssh-config';
import type { SshHost } from '../types';
import { isNodeError } from '../utils';

export class SshConfigParser {
  private static readonly EXCLUDED_PATTERNS = [
    /github\.com$/,
    /gitlab\.com$/,
    /bitbucket\.org$/,
    /heroku\.com$/,
    /^git$/,
  ];

  constructor(private readonly configPath?: string) {}

  async parseHosts(): Promise<SshHost[]> {
    const configPath = this.configPath || path.join(os.homedir(), '.ssh', 'config');

    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = SSHConfig.parse(configContent);

      return this.extractHosts(config);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private extractHosts(config: SSHConfig): SshHost[] {
    const hosts: SshHost[] = [];

    for (const section of config) {
      if (section.type !== SSHConfig.DIRECTIVE || section.param !== 'Host') {
        continue;
      }

      const hostValue = section.value;
      if (!hostValue || typeof hostValue !== 'string' || this.shouldExclude(hostValue)) {
        continue;
      }

      const hostConfig = this.extractHostConfig(config, hostValue);
      if (hostConfig) {
        hosts.push(hostConfig);
      }
    }

    return hosts;
  }

  private shouldExclude(hostValue: string): boolean {
    if (hostValue.includes('*') || hostValue.includes('?')) {
      return true;
    }

    return SshConfigParser.EXCLUDED_PATTERNS.some((pattern) => pattern.test(hostValue));
  }

  private extractHostConfig(config: SSHConfig, hostName: string): SshHost | null {
    const computed = config.compute(hostName);

    const hostnameRaw = computed.HostName;
    const hostname = (Array.isArray(hostnameRaw) ? hostnameRaw[0] : hostnameRaw) || hostName;

    const userRaw = computed.User;
    const user = Array.isArray(userRaw) ? userRaw[0] : userRaw;

    if (this.isExcludedByUser(user) || this.isExcludedByHostname(hostname)) {
      return null;
    }

    const portRaw = computed.Port;
    const portStr = Array.isArray(portRaw) ? portRaw[0] : portRaw;

    return {
      name: hostName,
      hostname,
      user,
      port: portStr ? parseInt(portStr, 10) : undefined,
    };
  }

  private isExcludedByUser(user?: string): boolean {
    return user === 'git';
  }

  private isExcludedByHostname(hostname: string): boolean {
    return SshConfigParser.EXCLUDED_PATTERNS.some((pattern) => pattern.test(hostname));
  }
}
