import * as assert from 'assert';
import * as sinon from 'sinon';
import { ConnectionManager } from '../../core/ConnectionManager';
import { RsyncExecutor } from '../../core/RsyncExecutor';
import type { ConnectionConfig, SyncConfig } from '../../types';
import { SyncTrigger } from '../../types';

suite('ConnectionManager', () => {
  let sandbox: sinon.SinonSandbox;
  let manager: ConnectionManager;
  let mockExecute: sinon.SinonStub;

  const connectionConfig: ConnectionConfig = {
    host: 'test-server',
    remotePath: '/remote/path',
    enabled: true,
  };

  const syncConfig: SyncConfig = {
    deleteExtraneous: true,
    useGitignore: true,
    additionalExcludes: [],
    retryCount: 2,
  };

  setup(() => {
    sandbox = sinon.createSandbox();
    manager = new ConnectionManager();
    mockExecute = sandbox.stub(RsyncExecutor.prototype, 'execute');
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should set and get connection', () => {
    const workspaceFolder = '/workspace/path';

    manager.setConnection(workspaceFolder, connectionConfig);
    const state = manager.getConnection(workspaceFolder);

    assert.ok(state);
    assert.deepStrictEqual(state.config, connectionConfig);
    assert.strictEqual(state.failureCount, 0);
  });

  test('should remove connection', () => {
    const workspaceFolder = '/workspace/path';

    manager.setConnection(workspaceFolder, connectionConfig);
    manager.removeConnection(workspaceFolder);

    const state = manager.getConnection(workspaceFolder);
    assert.strictEqual(state, undefined);
  });

  test('should track active operations', async () => {
    const workspaceFolder = '/workspace/path';
    manager.setConnection(workspaceFolder, connectionConfig);

    assert.strictEqual(manager.isActive(workspaceFolder), false);

    mockExecute.resolves({
      success: true,
      duration: 100,
      filesTransferred: 5,
      bytesTransferred: 1000,
    });

    const syncPromise = manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual);

    assert.strictEqual(manager.isActive(workspaceFolder), true);

    await syncPromise;

    assert.strictEqual(manager.isActive(workspaceFolder), false);
  });

  test('should prevent concurrent syncs', async () => {
    const workspaceFolder = '/workspace/path';
    manager.setConnection(workspaceFolder, connectionConfig);

    let resolveExecute: (() => void) | undefined;
    mockExecute.returns(
      new Promise((resolve) => {
        resolveExecute = (): void =>
          resolve({
            success: true,
            duration: 100,
            filesTransferred: 5,
            bytesTransferred: 1000,
          });
      }),
    );

    const sync1 = manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual);

    await assert.rejects(
      manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual),
      /Sync already in progress/,
    );

    if (resolveExecute) {
      resolveExecute();
    }
    await sync1;
  });

  test('should retry on failure', async () => {
    const workspaceFolder = '/workspace/path';
    manager.setConnection(workspaceFolder, connectionConfig);

    const clock = sandbox.useFakeTimers();

    mockExecute
      .onFirstCall()
      .resolves({
        success: false,
        duration: 100,
        filesTransferred: 0,
        bytesTransferred: 0,
        error: new Error('First failure'),
      })
      .onSecondCall()
      .resolves({
        success: false,
        duration: 100,
        filesTransferred: 0,
        bytesTransferred: 0,
        error: new Error('Second failure'),
      })
      .onThirdCall()
      .resolves({ success: true, duration: 100, filesTransferred: 5, bytesTransferred: 1000 });

    const syncPromise = manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual);

    await clock.tickAsync(1000);
    await clock.tickAsync(2000);

    const result = await syncPromise;

    assert.strictEqual(result.success, true);
    assert.strictEqual(mockExecute.callCount, 3);

    clock.restore();
  });

  test('should track failure count', async () => {
    const workspaceFolder = '/workspace/path';
    manager.setConnection(workspaceFolder, connectionConfig);

    mockExecute.resolves({
      success: false,
      duration: 100,
      filesTransferred: 0,
      bytesTransferred: 0,
      error: new Error('Connection failed'),
    });

    const syncConfigNoRetry = { ...syncConfig, retryCount: 0 };

    await manager.sync(workspaceFolder, syncConfigNoRetry, SyncTrigger.Manual);
    assert.strictEqual(manager.getFailureCount(workspaceFolder), 1);

    await manager.sync(workspaceFolder, syncConfigNoRetry, SyncTrigger.Manual);
    assert.strictEqual(manager.getFailureCount(workspaceFolder), 2);

    mockExecute.resolves({
      success: true,
      duration: 100,
      filesTransferred: 5,
      bytesTransferred: 1000,
    });

    await manager.sync(workspaceFolder, syncConfigNoRetry, SyncTrigger.Manual);
    assert.strictEqual(manager.getFailureCount(workspaceFolder), 0);
  });

  test('should update last sync time on success', async () => {
    const workspaceFolder = '/workspace/path';
    manager.setConnection(workspaceFolder, connectionConfig);

    assert.strictEqual(manager.getLastSyncTime(workspaceFolder), undefined);

    mockExecute.resolves({
      success: true,
      duration: 100,
      filesTransferred: 5,
      bytesTransferred: 1000,
    });

    await manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual);

    const lastSyncTime = manager.getLastSyncTime(workspaceFolder);
    assert.ok(lastSyncTime);
    assert.ok(lastSyncTime instanceof Date);
  });

  test('should throw when no connection configured', async () => {
    const workspaceFolder = '/workspace/path';

    await assert.rejects(
      manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual),
      /No active connection for workspace/,
    );
  });

  test('should throw when connection disabled', async () => {
    const workspaceFolder = '/workspace/path';
    const disabledConfig = { ...connectionConfig, enabled: false };

    manager.setConnection(workspaceFolder, disabledConfig);

    await assert.rejects(
      manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual),
      /No active connection for workspace/,
    );
  });

  test('should handle dry run correctly', async () => {
    const workspaceFolder = '/workspace/path';
    manager.setConnection(workspaceFolder, connectionConfig);

    mockExecute.resolves({
      success: true,
      duration: 100,
      filesTransferred: 10,
      bytesTransferred: 2000,
    });

    await manager.sync(workspaceFolder, syncConfig, SyncTrigger.Manual, true);

    assert.ok(mockExecute.calledWith(true));
  });
});
