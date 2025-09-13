import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FileSyncManager } from '../../core/FileSyncManager';
import type { TriggerConfig } from '../../types';

suite('FileSyncManager', () => {
  let sandbox: sinon.SinonSandbox;
  let manager: FileSyncManager;
  let clock: sinon.SinonFakeTimers;

  const triggerConfig: TriggerConfig = {
    patterns: ['*.py', '*.yaml'],
    excludePatterns: ['*.log', '*.tmp'],
  };

  const mockWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.file('/workspace/project'),
    name: 'project',
    index: 0,
  };

  setup(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    manager = new FileSyncManager(500);
  });

  teardown(() => {
    manager.dispose();
    sandbox.restore();
  });

  test('should register and trigger sync callback', async () => {
    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, triggerConfig, syncCallback);

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/project/main.py'),
    } as vscode.TextDocument;

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);

    manager.handleSave(mockDocument, triggerConfig);

    assert.ok(!syncCallback.called);

    await clock.tickAsync(500);

    assert.ok(syncCallback.calledOnce);
  });

  test('should debounce multiple saves', async () => {
    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, triggerConfig, syncCallback);

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/project/main.py'),
    } as vscode.TextDocument;

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);

    manager.handleSave(mockDocument, triggerConfig);
    await clock.tickAsync(100);
    manager.handleSave(mockDocument, triggerConfig);
    await clock.tickAsync(100);
    manager.handleSave(mockDocument, triggerConfig);

    await clock.tickAsync(500);

    assert.strictEqual(syncCallback.callCount, 1);
  });

  test('should respect trigger patterns', () => {
    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, triggerConfig, syncCallback);

    const getWorkspaceFolderStub = sandbox.stub(vscode.workspace, 'getWorkspaceFolder');
    getWorkspaceFolderStub.returns(mockWorkspaceFolder);

    const pythonDoc = {
      uri: vscode.Uri.file('/workspace/project/main.py'),
    } as vscode.TextDocument;
    manager.handleSave(pythonDoc, triggerConfig);

    clock.tick(500);
    assert.strictEqual(syncCallback.callCount, 1);

    const yamlDoc = {
      uri: vscode.Uri.file('/workspace/project/config.yaml'),
    } as vscode.TextDocument;
    manager.handleSave(yamlDoc, triggerConfig);

    clock.tick(500);
    assert.strictEqual(syncCallback.callCount, 2);

    const jsDoc = {
      uri: vscode.Uri.file('/workspace/project/script.js'),
    } as vscode.TextDocument;
    manager.handleSave(jsDoc, triggerConfig);

    clock.tick(500);
    assert.strictEqual(syncCallback.callCount, 2);
  });

  test('should respect exclude patterns', () => {
    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, triggerConfig, syncCallback);

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);

    const logDoc = {
      uri: vscode.Uri.file('/workspace/project/debug.log'),
    } as vscode.TextDocument;
    manager.handleSave(logDoc, triggerConfig);

    const tmpDoc = {
      uri: vscode.Uri.file('/workspace/project/cache.tmp'),
    } as vscode.TextDocument;
    manager.handleSave(tmpDoc, triggerConfig);

    clock.tick(500);

    assert.strictEqual(syncCallback.callCount, 0);
  });

  test('should handle wildcard pattern', () => {
    const wildcardConfig: TriggerConfig = {
      patterns: ['*'],
      excludePatterns: ['*.log'],
    };

    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, wildcardConfig, syncCallback);

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);

    const anyDoc = {
      uri: vscode.Uri.file('/workspace/project/anything.xyz'),
    } as vscode.TextDocument;
    manager.handleSave(anyDoc, wildcardConfig);

    clock.tick(500);

    assert.ok(syncCallback.calledOnce);
  });

  test('should ignore saves outside workspace', () => {
    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, triggerConfig, syncCallback);

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(undefined);

    const externalDoc = {
      uri: vscode.Uri.file('/other/location/file.py'),
    } as vscode.TextDocument;
    manager.handleSave(externalDoc, triggerConfig);

    clock.tick(500);

    assert.strictEqual(syncCallback.callCount, 0);
  });

  test('should unregister workspace', () => {
    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, triggerConfig, syncCallback);

    manager.unregisterWorkspace(mockWorkspaceFolder);

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/project/main.py'),
    } as vscode.TextDocument;
    manager.handleSave(mockDocument, triggerConfig);

    clock.tick(500);

    assert.strictEqual(syncCallback.callCount, 0);
  });

  test('should handle nested paths correctly', () => {
    const nestedConfig: TriggerConfig = {
      patterns: ['src/**/*.ts', 'test/**/*.test.ts'],
      excludePatterns: [],
    };

    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, nestedConfig, syncCallback);

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);

    const srcFile = {
      uri: vscode.Uri.file('/workspace/project/src/components/Button.ts'),
    } as vscode.TextDocument;
    manager.handleSave(srcFile, nestedConfig);

    clock.tick(500);
    assert.strictEqual(syncCallback.callCount, 1);

    const testFile = {
      uri: vscode.Uri.file('/workspace/project/test/components/Button.test.ts'),
    } as vscode.TextDocument;
    manager.handleSave(testFile, nestedConfig);

    clock.tick(500);
    assert.strictEqual(syncCallback.callCount, 2);

    const rootFile = {
      uri: vscode.Uri.file('/workspace/project/index.ts'),
    } as vscode.TextDocument;
    manager.handleSave(rootFile, nestedConfig);

    clock.tick(500);
    assert.strictEqual(syncCallback.callCount, 2);
  });

  test('should clear all timeouts on dispose', () => {
    const syncCallback = sandbox.stub();
    manager.registerWorkspace(mockWorkspaceFolder, triggerConfig, syncCallback);

    sandbox.stub(vscode.workspace, 'getWorkspaceFolder').returns(mockWorkspaceFolder);

    const mockDocument = {
      uri: vscode.Uri.file('/workspace/project/main.py'),
    } as vscode.TextDocument;
    manager.handleSave(mockDocument, triggerConfig);

    manager.dispose();

    clock.tick(500);

    assert.strictEqual(syncCallback.callCount, 0);
  });
});
