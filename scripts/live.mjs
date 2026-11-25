import assert from 'node:assert/strict';
import fs from 'node:fs';
import {abi, createAccount, createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {digest, sha, jsonSafe, rpc, receipt, source, read} from './check.mjs';

const journal = 'PROOFS.json';
const code = 'contracts/ProseResourceBank.py';
const verifyOnly = process.argv.includes('--verify-only');
const proof = fs.existsSync(journal)
  ? JSON.parse(fs.readFileSync(journal, 'utf8'))
  : {network: 'StudioNet', source_commit: process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
    transactions: [], snapshots: {}};
const save = () => fs.writeFileSync(journal, JSON.stringify(proof, null, 2) + '\n');
assert.match(proof.source_commit ?? '', /^[a-f0-9]{40}$/);
assert.equal(await rpc('eth_chainId', []), '0xf22f');
assert.equal(studionet.id, 61999);

// Persist acknowledged sends before an SDK error or process interruption.
const originalFetch = globalThis.fetch;
const sent = new Map();
let currentEntry;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  const request = JSON.parse(options?.body ?? '{}');
  if (url !== 'https://studio.genlayer.com/api' || request.method !== 'eth_sendRawTransaction') {
    return originalFetch(input, options);
  }
  assert(currentEntry && !currentEntry.hash, 'Inspect the journal before another send');
  const payload = request.params[0];
  assert.match(payload, /^0x[a-f0-9]+$/i);
  if (!sent.has(payload)) {
    sent.set(payload, (async () => {
      const response = await originalFetch(input, options);
      const body = await response.text();
      const data = JSON.parse(body);
      if (data.result) {
        assert.match(data.result, /^0x[a-f0-9]{64}$/i);
        currentEntry.hash = data.result;
        save();
        console.log(currentEntry.step, data.result);
      }
      return {body, status: response.status};
    })());
  }
  const response = await sent.get(payload);
  return new Response(response.body, {status: response.status, headers: {'content-type': 'application/json'}});
};

async function transaction(step, account, functionName, args, error) {
  let entry = proof.transactions.find(tx => tx.step === step);
  if (!entry) {
    assert(!verifyOnly && account, 'Missing broadcast journal');
    const nonce = await rpc('eth_getTransactionCount', [account.address, 'latest']);
    assert.equal(await rpc('eth_getTransactionCount', [account.address, 'pending']), nonce);
    const {defaultFees: fees} = await rpc('sim_getFeeConfig', []);
    assert(fees?.distribution);
    const feeValue = BigInt(fees.feeValue);
    assert(feeValue >= 0n && feeValue <= 1_000_000_000_000_000n, 'Studio quote exceeds demo budget');
    assert(BigInt(await rpc('eth_getBalance', [account.address, 'latest'])) >= feeValue);
    entry = {step, signer: account.address, nonce, functionName, args, fee_wei: String(feeValue),
      ...(error ? {error} : {})};
    proof.transactions.push(entry);
    save();
    currentEntry = entry;
    const client = createClient({chain: studionet, account});
    const hash = functionName === 'deploy'
      ? await client.deployContract({code: fs.readFileSync(code), args: [], fees, leaderOnly: false})
      : await client.writeContract({
        address: proof.address, functionName, args, value: 0n, fees, leaderOnly: false,
      });
    assert.equal(hash, entry.hash);
    currentEntry = undefined;
  }
  assert.deepEqual(entry.args, args);
  assert.equal(entry.functionName, functionName);
  assert.equal(entry.error, error);
  assert(entry.hash, 'Broadcast status unknown. Inspect the recorded nonce before resuming.');
  entry.receipt = await receipt(entry.hash, error ? 'ERROR' : 'SUCCESS', error, entry.consensus ?? 'MAJORITY_AGREE');
  save();
  assert.equal(entry.receipt.committed, !error);
  const native = await rpc('eth_getTransactionByHash', [entry.hash]);
  assert.equal(native.from_address.toLowerCase(), entry.signer.toLowerCase());
  assert.equal(BigInt(native.nonce), BigInt(entry.nonce));
  assert.equal(BigInt(native.value), 0n);
  const envelope = await rpc('eth_getTransactionReceipt', [entry.hash]);
  assert.equal(envelope.status, '0x1');
  assert.equal(envelope.from.toLowerCase(), entry.signer.toLowerCase());
  console.log(step, entry.receipt.status, entry.receipt.execution);
  if (error) return;
  if (functionName === 'deploy') return {address: entry.receipt.address};
  const leader = native.consensus_data.leader_receipt.find(item => item.mode === 'leader');
  const bytes = Buffer.from(leader.result, 'base64');
  assert.equal(bytes[0], 0);
  return {address: entry.receipt.address, result: jsonSafe(abi.calldata.decode(bytes.subarray(1)))};
}

assert(verifyOnly ? proof.verified : !proof.transactions.length,
  'Use a fresh journal to broadcast, or verify a completed journal');

const accounts = verifyOnly ? [null, null] : [createAccount(), createAccount()];
if (!verifyOnly) {
  proof.controllers = accounts.map(account => account.address.toLowerCase());
  proof.test_faucet = [];
  for (const account of accounts) {
    const amount = 10_000_000_000_000_000;
    const response = await fetch('https://studio.genlayer.com/api', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'sim_fundAccount', params: [account.address, amount]}),
      signal: AbortSignal.timeout(20000),
    });
    const funded = await response.json();
    assert(response.ok && !funded.error, 'Studio faucet request failed');
    const balance = BigInt(await rpc('eth_getBalance', [account.address, 'latest']));
    assert(balance >= BigInt(amount), 'Studio faucet did not credit the demo account');
    proof.test_faucet.push({address: account.address, requested_wei: String(amount)});
    save();
  }
}

const [a, b] = accounts;
const {address} = await transaction('deploy', a, 'deploy', []);
proof.address = address;
proof.source = await source(address);
save();

const body = fs.readFileSync('fixtures/bank.json');
const coordinate = 'stoneforger10/prose-resource-bank/' + proof.source_commit + '/fixtures/bank.json';
const url = 'https://raw.githubusercontent.com/' + coordinate;
const sha256 = sha(body);
const specification = digest({url, sha256});
const key = digest({specification, controllers: proof.controllers});
const {result: opened} = await transaction('open-bank', a, 'open_bank',
  [coordinate, sha256, JSON.stringify(proof.controllers)]);
assert.equal(opened, key);
const record = await read(address, 'get_specification', [specification]);
assert.deepEqual(record, {
  url, sha256, text: body.toString('utf8'), document: JSON.parse(body),
  claims: {status: 'READY', capacity: [3, 2], maximum: [[3, 2], [2, 2]]},
});
proof.bank_key = key;
proof.specification = record;
save();

async function snapshot(step, held, finished, available, safeOrder) {
  const expected = {specification, controllers: proof.controllers, status: 'READY',
    held, finished, available, safe_order: safeOrder};
  const state = verifyOnly && step !== 'b-finish'
    ? proof.snapshots[step] : await read(address, 'get_bank', [key]);
  assert.deepEqual(state, expected);
  proof.snapshots[step] = state;
  save();
}

const empty = [[0, 0], [0, 0]];
const afterA = [[1, 1], [0, 0]];
const afterB = [[0, 0], [1, 1]];
const open = [false, false];
const aFinished = [true, false];
await snapshot('open-bank', empty, open, [3, 2], [0, 1]);
assert.deepEqual((await transaction('a-request', a, 'request', [key, '[1,1]'])).result, [0, 1]);
await snapshot('a-request', afterA, open, [2, 1], [0, 1]);
await transaction('b-unsafe-denied', b, 'request', [key, '[1,1]'],
  'Request leaves no safe completion order');
await snapshot('b-unsafe-denied', afterA, open, [2, 1], [0, 1]);
assert.deepEqual((await transaction('a-finish', a, 'finish', [key])).result, [1, 1]);
await snapshot('a-finish', empty, aFinished, [3, 2], [1]);
assert.deepEqual((await transaction('b-request', b, 'request', [key, '[1,1]'])).result, [1]);
await snapshot('b-request', afterB, aFinished, [2, 1], [1]);
assert.deepEqual((await transaction('b-finish', b, 'finish', [key])).result, [1, 1]);
await snapshot('b-finish', empty, [true, true], [3, 2], []);
proof.verified = true;
save();
console.log('Verified exact source and claims, refusal of an unsafe request, and successful retry after release');
