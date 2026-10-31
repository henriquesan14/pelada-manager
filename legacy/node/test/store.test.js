import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createStore } from '../lib/store.mjs';

const setupToken = 'synthetic-setup-key-for-automated-tests';
const account = (email, extra = {}) => ({ name: email.split('@')[0], email, password: 'Synthetic-password-123', ...extra });
const status = code => error => error.status === code;

test('contas por convite, concorrência, autoria, conflitos e remoção de acesso', async () => {
  const store = createStore(':memory:');
  try {
    await assert.rejects(store.register(account('owner@example.test'), setupToken), status(403));
    const owner = await store.register(account('owner@example.test', { setupToken }), setupToken);
    assert.equal(owner.user.role, 'owner');
    assert.equal(store.authenticate(owner.token).id, owner.user.id);
    await assert.rejects(store.login({ email: 'owner@example.test', password: 'incorrect' }), status(401));
    await assert.rejects(store.register(account('stranger@example.test'), setupToken), status(403));
    const invitation = store.invite(owner.user);
    const registrations = await Promise.allSettled([
      store.register(account('alice@example.test', { invite: invitation.invite }), setupToken),
      store.register(account('bob@example.test', { invite: invitation.invite }), setupToken),
    ]);
    assert.equal(registrations.filter(r => r.status === 'fulfilled').length, 1);
    const organizer = registrations.find(r => r.status === 'fulfilled').value;
    assert.equal(organizer.user.role, 'organizer');
    assert.throws(() => store.invite(organizer.user), status(403));
    await assert.rejects(store.register(account('third@example.test', { invite: invitation.invite }), setupToken), status(403));
    const loggedIn = await store.login(account(organizer.user.email));
    assert.equal(loggedIn.user.id, organizer.user.id);
    let result = store.action(owner.user, { type: 'addPlayer', revision: 0, name: 'Ana', level: 5 });
    assert.throws(() => store.action(organizer.user, { type: 'addPlayer', revision: 0, name: 'Beto', level: 3 }), status(409));
    assert.equal(store.snapshot().state.players.length, 1);
    result = store.action(organizer.user, { type: 'addPlayer', revision: result.revision, name: 'Beto', level: 3 });
    result = store.action(owner.user, { type: 'draw', revision: result.revision, players: result.state.players.map(p => p.id), count: 2 });
    const [a, b] = result.state.teams;
    assert.throws(() => store.action(owner.user, { type: 'addMatch', revision: result.revision, a: a.id, b: b.id, scoreA: -1, scoreB: 0 }), status(400));
    assert.equal(store.snapshot().revision, result.revision);
    result = store.action(organizer.user, { type: 'addMatch', revision: result.revision, a: a.id, b: b.id, scoreA: 2, scoreB: 1 });
    assert.equal(result.state.matches[0].createdBy, organizer.user.id);
    assert.equal(result.state.matches[0].createdByName, organizer.user.name);
    assert.ok(store.activity().some(a => a.action.includes('Registrou')));
    assert.throws(() => store.revoke(organizer.user, owner.user.id), status(403));
    assert.throws(() => store.revoke(owner.user, owner.user.id), status(400));
    store.revoke(owner.user, organizer.user.id);
    assert.throws(() => store.action(organizer.user, { type: 'removeMatch', revision: result.revision, id: result.state.matches[0].id }), status(401));
    assert.equal(store.authenticate(organizer.token), null);
    assert.equal(store.authenticate(loggedIn.token), null);
    await assert.rejects(store.login(account(organizer.user.email)), status(401));
    store.logout(owner.token);
    assert.equal(store.authenticate(owner.token), null);
  } finally { store.close(); }
});

test('importação inicial é validada, preserva placares e não sobrescreve uma pelada existente', async () => {
  const store = createStore(':memory:');
  try {
    const owner = (await store.register(account('owner@example.test', { setupToken }), setupToken)).user;
    const data = { players: [{ id: 'a', name: 'Ana', level: 3 }, { id: 'b', name: 'Beto', level: 4 }],
      matches: [{ id: 'm1', a: ['a'], b: ['b'], scoreA: 1, scoreB: 0, nameA: 'Time 1', nameB: 'Time 2', date: '2026-10-30T12:00:00Z' }] };
    assert.throws(() => store.action(owner, { type: 'importLegacy', revision: 0, data: { ...data, players: [...data.players, data.players[0]] } }), status(400));
    assert.equal(store.snapshot().revision, 0);
    const imported = store.action(owner, { type: 'importLegacy', revision: 0, data });
    assert.equal(imported.state.matches[0].scoreA, 1);
    assert.equal(imported.state.matches[0].createdByName, 'Importação da versão local');
    assert.equal(imported.state.players[0].id, 'a');
    assert.deepEqual(imported.state.teams, []);
    assert.throws(() => store.action(owner, { type: 'importLegacy', revision: imported.revision, data }), status(409));
  } finally { store.close(); }
});

test('convites e sessões expiram no prazo', async t => {
  const store = createStore(':memory:');
  try {
    const owner = await store.register(account('owner@example.test', { setupToken }), setupToken);
    const invitation = store.invite(owner.user);
    const now = Date.now();
    t.mock.method(Date, 'now', () => now + 2 * 86400000);
    await assert.rejects(store.register(account('late@example.test', { invite: invitation.invite }), setupToken), status(403));
    assert.ok(store.authenticate(owner.token));
    t.mock.method(Date, 'now', () => now + 8 * 86400000);
    assert.equal(store.authenticate(owner.token), null);
  } finally { store.close(); }
});

test('dados, contas e sessões persistem ao reabrir o banco', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'resenha-test-'));
  const database = join(directory, 'test.sqlite');
  let store = createStore(database);
  try {
    const owner = await store.register(account('owner@example.test', { setupToken }), setupToken);
    store.action(owner.user, { type: 'addPlayer', revision: 0, name: 'Persistente', level: 3 });
    store.close();
    store = createStore(database);
    assert.equal(store.snapshot().state.players[0].name, 'Persistente');
    assert.equal(store.snapshot().revision, 1);
    assert.equal(store.authenticate(owner.token).email, 'owner@example.test');
    assert.equal(store.hasUsers(), true);
  } finally {
    store.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.startsWith(join(tmpdir(), 'resenha-test-')));
    rmSync(directory, { recursive: true });
  }
});
