import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SshConfigParser } from '../../core/SshConfigParser';

suite('SshConfigParser', () => {
  let tempDir: string;
  let configPath: string;
  let parser: SshConfigParser;

  setup(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ssh-test-'));
    configPath = path.join(tempDir, 'config');
    parser = new SshConfigParser(configPath);
  });

  teardown(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  test('should parse valid SSH hosts', async () => {
    const sshConfig = `
Host dev-server
  HostName 192.168.1.100
  User developer
  Port 2222

Host prod-server
  HostName prod.example.com
  User admin

Host github.com
  HostName github.com
  User git

Host *.internal
  User root
    `;

    await fs.writeFile(configPath, sshConfig);

    const hosts = await parser.parseHosts();

    assert.strictEqual(hosts.length, 2);

    const devServer = hosts.find((h) => h.name === 'dev-server');
    assert.ok(devServer);
    assert.strictEqual(devServer.hostname, '192.168.1.100');
    assert.strictEqual(devServer.user, 'developer');
    assert.strictEqual(devServer.port, 2222);

    const prodServer = hosts.find((h) => h.name === 'prod-server');
    assert.ok(prodServer);
    assert.strictEqual(prodServer.hostname, 'prod.example.com');
    assert.strictEqual(prodServer.user, 'admin');
    assert.strictEqual(prodServer.port, undefined);
  });

  test('should exclude GitHub and similar hosts', async () => {
    const sshConfig = `
Host github.com
  HostName github.com
  User git

Host gitlab.com
  HostName gitlab.com
  User git

Host bitbucket.org
  HostName bitbucket.org
  User git

Host valid-server
  HostName server.example.com
  User developer
    `;

    await fs.writeFile(configPath, sshConfig);

    const hosts = await parser.parseHosts();

    assert.strictEqual(hosts.length, 1);
    assert.strictEqual(hosts[0].name, 'valid-server');
  });

  test('should exclude wildcard hosts', async () => {
    const sshConfig = `
Host *.example.com
  User admin

Host ??-server
  User root

Host valid-server
  HostName server.example.com
    `;

    await fs.writeFile(configPath, sshConfig);

    const hosts = await parser.parseHosts();

    assert.strictEqual(hosts.length, 1);
    assert.strictEqual(hosts[0].name, 'valid-server');
  });

  test('should handle missing SSH config file', async () => {
    const missingParser = new SshConfigParser(path.join(tempDir, 'nonexistent'));
    const hosts = await missingParser.parseHosts();

    assert.strictEqual(hosts.length, 0);
  });

  test('should throw on other file read errors', async () => {
    await fs.writeFile(configPath, 'test');
    await fs.chmod(configPath, 0o000);

    try {
      await parser.parseHosts();
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(
        (error as NodeJS.ErrnoException).code === 'EACCES' ||
          error.message.includes('EACCES') ||
          error.message.includes('Permission denied'),
      );
    } finally {
      await fs.chmod(configPath, 0o644);
    }
  });

  test('should exclude hosts with git user', async () => {
    const sshConfig = `
Host git-server
  HostName server.example.com
  User git

Host valid-server
  HostName server.example.com
  User developer
    `;

    await fs.writeFile(configPath, sshConfig);

    const hosts = await parser.parseHosts();

    assert.strictEqual(hosts.length, 1);
    assert.strictEqual(hosts[0].name, 'valid-server');
  });

  test('should handle computed hostname from SSH config', async () => {
    const sshConfig = `
Host myserver
  HostName %h.example.com
  User admin

Host shortname
  User developer
    `;

    await fs.writeFile(configPath, sshConfig);

    const hosts = await parser.parseHosts();

    const myserver = hosts.find((h) => h.name === 'myserver');
    assert.ok(myserver);
    assert.strictEqual(myserver.hostname, '%h.example.com');

    const shortname = hosts.find((h) => h.name === 'shortname');
    assert.ok(shortname);
    assert.strictEqual(shortname.hostname, 'shortname');
  });
});
