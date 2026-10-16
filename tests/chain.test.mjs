// Focused application recovery tests with simulated RPC and wallet providers.
// This executes the actual chain module in an isolated VM, but does not claim
// to test real wallet signatures, network consensus, or deployed contracts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assertExecutionSucceeded, terminalStatus, hasConsensusFailure} from '../src/receipt.js';

const ADDRESS = `0x${'b'.repeat(40)}`;
const ACCOUNT = `0x${'c'.repeat(40)}`;
const HASH = `0x${'a'.repeat(64)}`;
const PENDING_KEY = 'releaseproof.pending.v1';
const successfulReceipt = () => ({
  statusName: 'FINALIZED',
  consensus_data: {leader_receipt: [{
    mode: 'leader', execution_result: 'SUCCESS', result: {status: 'return'},
  }]},
});

function harness({savedPending, states = []} = {}) {
  const source = readFileSync(new URL('../src/chain.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '')
    .replace(/import\.meta\.env\.BASE_URL/g, "''")
    + '\nglobalThis.testApi = {connectWallet, sendWrite, resumePending, pendingTransaction};';
  const storage = new Map(savedPending ? [[PENDING_KEY, JSON.stringify(savedPending)]] : []);
  const emitted = [];
  const reads = [];
  const writes = [];
  const listeners = new Map();
  let receipt = successfulReceipt();
  let selectedAccount = ACCOUNT;
  const provider = {
    isMetaMask: true,
    async request({method}) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [selectedAccount];
      if (method === 'eth_chainId') return '0xf22f';
      throw new Error(`Unexpected simulated wallet request: ${method}`);
    },
  };
  const readClient = {
    async getTransaction({hash}) {
      assert.equal(hash, HASH);
      return receipt;
    },
    async readContract(call) {
      reads.push(call);
      assert.equal(call.address, ADDRESS);
      if (!states.length) throw new Error('No simulated read-back response configured');
      const value = states.shift();
      if (value instanceof Error) throw value;
      return JSON.stringify(value);
    },
  };
  const walletClient = {
    async writeContract(call) {
      writes.push(call);
      return HASH;
    },
  };
  const context = {
    createClient: options => options.provider ? walletClient : readClient,
    studionet: {},
    deployment: {deployed: true, address: ADDRESS, chainId: 61999,
                 rpc: 'https://studio.genlayer.com/api', explorer: 'https://explorer-studio.genlayer.com'},
    assertExecutionSucceeded, terminalStatus, hasConsensusFailure,
    Event: class { constructor(type) { this.type = type; } },
    window: {
      ethereum: provider,
      addEventListener(type, callback) { listeners.set(type, callback); },
      dispatchEvent(event) {
        if (event.type === 'eip6963:requestProvider') {
          listeners.get('eip6963:announceProvider')?.({detail: {
            provider, info: {uuid: 'test-metamask', rdns: 'io.metamask'},
          }});
        }
      },
    },
    setTimeout(callback) { queueMicrotask(callback); return 1; },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, {filename: 'chain.js'});
  return {
    api: context.testApi, storage, writes, reads, emitted,
    onProgress: event => emitted.push(event),
    setReceipt: value => { receipt = value; },
    setAccount: value => { selectedAccount = value; },
  };
}

function acknowledgmentPending(revision = 1) {
  return {hash: HASH, method: 'acknowledge_revision', args: ['r1', revision], address: ADDRESS};
}

test('historical acknowledgment recovers after a newer revision was acknowledged', async () => {
  const app = harness({savedPending: acknowledgmentPending(), states: [
    {id: 'r1', acknowledged_revision: 2, acknowledged_revisions: [1, 2]},
  ]});
  const result = await app.api.resumePending(app.onProgress);
  assert.equal(result.hash, HASH);
  assert.equal(app.storage.has(PENDING_KEY), false);
  assert.equal(app.emitted.at(-1).status, 'success');
  assert.equal(app.reads[0].functionName, 'get_review');
  assert.equal(app.writes.length, 0, 'Recovery must not send a duplicate transaction');
});

test('successful execution retains pending on transient read failure then recovers from history', async () => {
  const app = harness({states: [
    new Error('RPC read temporarily unavailable'),
    {id: 'r1', acknowledged_revision: 2, acknowledged_revisions: [1, 2]},
  ]});
  await app.api.connectWallet();
  await assert.rejects(app.api.sendWrite('acknowledge_revision', ['r1', 1], app.onProgress),
                       /RPC read temporarily unavailable/);
  assert.equal(app.api.pendingTransaction().hash, HASH);
  assert.equal(app.writes.length, 1);
  assert.equal(app.emitted.at(-1).status, 'error');
  await assert.rejects(app.api.sendWrite('acknowledge_revision', ['r1', 1], app.onProgress),
                       /transaction is pending/);
  assert.equal(app.writes.length, 1, 'The pending action must prevent blind resubmission');
  await app.api.resumePending(app.onProgress);
  assert.equal(app.storage.has(PENDING_KEY), false);
  assert.equal(app.writes.length, 1);
  assert.equal(app.emitted.at(-1).status, 'success');
});

test('latest acknowledgment number alone cannot confirm an absent historical acknowledgment', async () => {
  const app = harness({savedPending: acknowledgmentPending(), states: [
    {id: 'r1', acknowledged_revision: 2, acknowledged_revisions: [2]},
  ]});
  await assert.rejects(app.api.resumePending(app.onProgress), /Acknowledged revision read-back mismatch/);
  assert.equal(app.storage.has(PENDING_KEY), true);
  assert.equal(app.emitted.at(-1).status, 'error');
});

test('a known reverted contract execution clears pending without claiming state success', async () => {
  const app = harness({savedPending: acknowledgmentPending()});
  app.setReceipt({statusName: 'FINALIZED', consensus_data: {leader_receipt: [{
    mode: 'leader', execution_result: 'ERROR', result: {status: 'error'},
  }]}});
  await assert.rejects(app.api.resumePending(app.onProgress), /execution was not successful/);
  assert.equal(app.storage.has(PENDING_KEY), false);
  assert.equal(app.reads.length, 0);
  assert.equal(app.emitted.some(event => event.status === 'success'), false);
});

test('a changed wallet account is rejected before any transaction is sent', async () => {
  const app = harness();
  await app.api.connectWallet();
  app.setAccount(`0x${'d'.repeat(40)}`);
  await assert.rejects(app.api.sendWrite('acknowledge_revision', ['r1', 1], app.onProgress),
                       /wallet account changed/);
  assert.equal(app.writes.length, 0);
  assert.equal(app.storage.has(PENDING_KEY), false);
});
