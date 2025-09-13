import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { RsyncExecutor, type FileSystem, type SpawnFunction } from '../../core/RsyncExecutor';
import type { ConnectionConfig, SyncConfig } from '../../types';

suite('RsyncExecutor', () => {
  let sandbox: sinon.SinonSandbox;
  let executor: RsyncExecutor;
  let mockSpawn: sinon.SinonStub;
  let mockProcess: MockChildProcess;
  let mockFs: FileSystem;

  const connectionConfig: ConnectionConfig = {
    host: 'test-server',
    remotePath: '/remote/path',
    enabled: true,
  };

  const syncConfig: SyncConfig = {
    deleteExtraneous: true,
    useGitignore: true,
    additionalExcludes: ['node_modules', '__pycache__'],
    retryCount: 3,
  };

  class MockChildProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();

    kill(): void {}
  }

  setup(() => {
    sandbox = sinon.createSandbox();
    mockProcess = new MockChildProcess();
    mockSpawn = sinon.stub().returns(mockProcess);
    mockFs = {
      access: sinon.stub().resolves(),
    };
    executor = new RsyncExecutor(
      '/local/path',
      connectionConfig,
      syncConfig,
      mockSpawn as SpawnFunction,
      mockFs,
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should execute rsync with correct arguments', async () => {
    const executePromise = executor.execute(false);

    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(mockSpawn.calledOnce);
    const [command, args] = mockSpawn.firstCall.args as [string, string[]];

    assert.strictEqual(command, 'rsync');
    assert.ok(args.includes('-avz'));
    assert.ok(args.includes('--stats'));
    assert.ok(args.includes('--delete'));
    assert.ok(args.includes('--exclude=.git'));
    assert.ok(args.includes('--exclude=node_modules'));
    assert.ok(args.includes('--exclude=__pycache__'));
    assert.ok(args.includes('/local/path/'));
    assert.ok(args.includes('test-server:/remote/path'));

    mockProcess.stdout.emit('data', Buffer.from('Number of files transferred: 10\n'));
    mockProcess.stdout.emit('data', Buffer.from('Total transferred file size: 1,024 bytes\n'));
    mockProcess.emit('close', 0);

    const result = await executePromise;

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.filesTransferred, 10);
    assert.strictEqual(result.bytesTransferred, 1024);
  });

  test('should handle dry run correctly', async () => {
    (mockFs.access as sinon.SinonStub).rejects();

    const executePromise = executor.execute(true);

    await new Promise((resolve) => setImmediate(resolve));

    const [, args] = mockSpawn.firstCall.args as [string, string[]];
    assert.ok(args.includes('--dry-run'));

    mockProcess.emit('close', 0);

    const result = await executePromise;
    assert.strictEqual(result.success, true);
  });

  test('should handle rsync failure', async () => {
    (mockFs.access as sinon.SinonStub).rejects();

    const executePromise = executor.execute(false);

    await new Promise((resolve) => setImmediate(resolve));

    mockProcess.stderr.emit('data', Buffer.from('rsync error: connection refused\n'));
    mockProcess.emit('close', 1);

    const result = await executePromise;

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('connection refused'));
  });

  test('should handle spawn error', async () => {
    (mockFs.access as sinon.SinonStub).rejects();

    const executePromise = executor.execute(false);

    await new Promise((resolve) => setImmediate(resolve));

    const spawnError = new Error('Command not found');
    mockProcess.emit('error', spawnError);

    const result = await executePromise;

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, spawnError);
  });

  test('should include gitignore when file exists', async () => {
    const executePromise = executor.execute(false);

    await new Promise((resolve) => setImmediate(resolve));

    const [, args] = mockSpawn.firstCall.args as [string, string[]];
    assert.ok(
      args.some((arg: string) => arg.includes('--exclude-from=') && arg.includes('.gitignore')),
    );

    mockProcess.emit('close', 0);
    await executePromise;
  });

  test('should not include gitignore when file does not exist', async () => {
    (mockFs.access as sinon.SinonStub).rejects();

    const executePromise = executor.execute(false);

    await new Promise((resolve) => setImmediate(resolve));

    const [, args] = mockSpawn.firstCall.args as [string, string[]];
    assert.ok(!args.some((arg: string) => arg.includes('--exclude-from=')));

    mockProcess.emit('close', 0);
    await executePromise;
  });

  test('should not include delete flag when disabled', async () => {
    const nonDeleteConfig: SyncConfig = {
      ...syncConfig,
      deleteExtraneous: false,
    };

    executor = new RsyncExecutor(
      '/local/path',
      connectionConfig,
      nonDeleteConfig,
      mockSpawn as SpawnFunction,
      mockFs,
    );
    (mockFs.access as sinon.SinonStub).rejects();

    const executePromise = executor.execute(false);

    await new Promise((resolve) => setImmediate(resolve));

    const [, args] = mockSpawn.firstCall.args as [string, string[]];
    assert.ok(!args.includes('--delete'));

    mockProcess.emit('close', 0);
    await executePromise;
  });

  test('should parse stats correctly', async () => {
    (mockFs.access as sinon.SinonStub).rejects();

    const executePromise = executor.execute(false);

    await new Promise((resolve) => setImmediate(resolve));

    const statsOutput = `
Number of files: 150
Number of created files: 5
Number of deleted files: 2
Number of files transferred: 25
Total file size: 500,000 bytes
Total transferred file size: 100,500 bytes
Literal data: 95,000 bytes
Matched data: 5,500 bytes
    `;

    mockProcess.stdout.emit('data', Buffer.from(statsOutput));
    mockProcess.emit('close', 0);

    const result = await executePromise;

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.filesTransferred, 25);
    assert.strictEqual(result.bytesTransferred, 100500);
  });
});
