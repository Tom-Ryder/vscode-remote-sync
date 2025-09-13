import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { SshHost } from '../types';

const SSHConfig = require('ssh-config') as {
  parse: (str: string) => SSHConfigType;
  DIRECTIVE: 1;
};

interface SSHConfigType {
  compute: (host: string) => Record<string, string | undefined>;
  [Symbol.iterator]: () => Iterator<SSHConfigLine>;
}

interface SSHConfigLine {
  type: number;
  param?: string;
  value?: string;
}

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
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private extractHosts(config: SSHConfigType): SshHost[] {
    const hosts: SshHost[] = [];

    for (const section of config) {
      if (section.type !== 1 || section.param !== 'Host') {
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

    return SshConfigParser.EXCLUDED_PATTERNS.some((pattern) => {
      if (pattern instanceof RegExp) {
        return pattern.test(hostValue);
      }
      return false;
    });
  }

  private extractHostConfig(config: SSHConfigType, hostName: string): SshHost | null {
    const computed = (
      config as { compute: (host: string) => Record<string, string | undefined> }
    ).compute(hostName);

    const hostname = (computed.HostName as string) || hostName;
    const user = computed.User;

    if (this.isExcludedByUser(user) || this.isExcludedByHostname(hostname)) {
      return null;
    }

    return {
      name: hostName,
      hostname,
      user,
      port: computed.Port ? parseInt(computed.Port, 10) : undefined,
    };
  }

  private isExcludedByUser(user?: string): boolean {
    return user === 'git';
  }

  private isExcludedByHostname(hostname: string): boolean {
    return SshConfigParser.EXCLUDED_PATTERNS.some((pattern) => pattern.test(hostname));
  }
}
