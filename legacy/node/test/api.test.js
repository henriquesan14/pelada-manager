import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.mjs';

test('API autentica sessões, bloqueia outra origem e publica alterações entre contas', { timeout: 20000 }, async () => {
  const setupToken = 'synthetic-api-setup-key-for-tests';
  const app = createApp({ database: ':memory:', setupToken, secure: false, origin: undefined });
  try {
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    async function request(path, { body, cookie, foreign = false } = {}) {
      return fetch(`${origin}/api/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { ...(body ? { 'Content-Type': 'application/json', 'X-Resenha-Client': '1', Origin: foreign ? 'https://other.example' : origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(3000),
      });
    }
    assert.equal((await request('state')).status, 401);
    const info = await (await request('session')).json();
    assert.equal(info.needsSetup, true);
    const registration = { name: 'Dono', email: 'owner@example.test', password: 'Synthetic-password-123', setupToken };
    assert.equal((await request('register', { body: registration, foreign: true })).status, 403);
    const response = await request('register', { body: registration });
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Strict/);
    const ownerCookie = header.split(';')[0];
    const invitation = await (await request('invites', { body: {}, cookie: ownerCookie })).json();
    const joined = await request('register', { body: { name: 'Outro', email: 'other@example.test', password: 'Synthetic-password-123', invite: invitation.invite } });
    assert.equal(joined.status, 200);
    const organizerCookie = joined.headers.get('set-cookie').split(';')[0];
    const organizer = (await joined.json()).user;
    assert.equal((await request('invites', { body: {}, cookie: organizerCookie })).status, 403);
    const saved = await request('actions', { cookie: ownerCookie, body: { type: 'addPlayer', revision: 0, name: 'Jogador compartilhado', level: 4 } });
    assert.equal(saved.status, 200);
    const shared = await (await request('state', { cookie: organizerCookie })).json();
    assert.equal(shared.state.players[0].name, 'Jogador compartilhado');
    const stale = await request('actions', { cookie: organizerCookie, body: { type: 'addPlayer', revision: 0, name: 'Conflito', level: 3 } });
    assert.equal(stale.status, 409);
    assert.equal((await request('state', { cookie: ownerCookie })).headers.get('cache-control'), 'no-store');
    const organizers = await (await request('organizers', { cookie: ownerCookie })).json();
    assert.equal(organizers.organizers.length, 2);
    assert.equal(JSON.stringify(organizers).includes('password_hash'), false);
    assert.equal((await request('revoke', { cookie: ownerCookie, body: { id: organizer.id } })).status, 200);
    assert.equal((await request('state', { cookie: organizerCookie })).status, 401);
    assert.equal((await request('logout', { cookie: ownerCookie, body: {} })).status, 200);
    assert.equal((await request('state', { cookie: ownerCookie })).status, 401);
    const home = await fetch(origin);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /auth|account\.css/);
  } finally { await app.close(); }
});
