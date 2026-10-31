import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { drawTeams } from '../public/core.js';
import { requireValue } from './errors.mjs';

const deriveKey = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const text = (value, max = 80) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const emailAddress = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

async function passwordHash(password, salt) {
  return Buffer.from(await deriveKey(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('hex');
}

export function createStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      hash TEXT PRIMARY KEY, created_by TEXT NOT NULL REFERENCES users(id),
      expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pelada (
      id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL, date TEXT NOT NULL
    );
    INSERT OR IGNORE INTO pelada VALUES (1, 0, '{"players":[],"matches":[],"teams":[]}');
  `);

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const hasUsers = () => Boolean(db.prepare('SELECT 1 FROM users LIMIT 1').get());
  function snapshot() {
    const row = db.prepare('SELECT revision, data FROM pelada WHERE id = 1').get();
    return { revision: row.revision, state: JSON.parse(row.data) };
  }
  function record(actor, action) {
    db.prepare('INSERT INTO audit (actor_id, action, date) VALUES (?, ?, ?)').run(actor.id, action, new Date().toISOString());
  }
  function authorize(actor) {
    const current = db.prepare('SELECT id, role FROM users WHERE id = ? AND active = 1').get(actor.id);
    requireValue(current && current.role === actor.role, 'Entre na sua conta para continuar.', 401);
  }
  function session(user) {
    const value = token();
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(value), user.id, Date.now() + 7 * 86400000);
    return { token: value, user: publicUser(user) };
  }
  async function register(input, setupToken) {
    const email = emailAddress(input.email);
    requireValue(text(input.name, 50), 'Informe um nome com até 50 caracteres.');
    requireValue(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Informe um e-mail válido.');
    requireValue(typeof input.password === 'string' && input.password.length >= 12 && input.password.length <= 128, 'Use uma senha de 12 a 128 caracteres.');
    const first = !hasUsers();
    if (first) {
      requireValue(typeof setupToken === 'string' && setupToken.length >= 24, 'A configuração inicial precisa ser habilitada no servidor.', 503);
      requireValue(typeof input.setupToken === 'string' && digest(input.setupToken) === digest(setupToken), 'Chave de configuração inválida.', 403);
    } else {
      requireValue(typeof input.invite === 'string' && /^[a-f0-9]{64}$/.test(input.invite), 'Você precisa de um convite válido.', 403);
      const invitation = db.prepare('SELECT * FROM invites WHERE hash = ?').get(digest(input.invite));
      requireValue(invitation && !invitation.used && invitation.expires > Date.now(), 'Convite expirado ou já utilizado.', 403);
    }
    const salt = randomBytes(16).toString('hex');
    const hash = await passwordHash(input.password, salt);
    return transaction(() => {
      // Recheck after hashing: requests may compete for the same invitation.
      if (first) requireValue(!hasUsers(), 'A configuração já foi concluída. Entre com sua conta.', 409);
      else {
        const invitation = db.prepare('SELECT * FROM invites WHERE hash = ?').get(digest(input.invite));
        requireValue(invitation && !invitation.used && invitation.expires > Date.now(), 'Convite expirado ou já utilizado.', 403);
      }
      requireValue(!db.prepare('SELECT id FROM users WHERE email = ?').get(email), 'Este e-mail já está cadastrado.', 409);
      const user = { id: randomUUID(), name: input.name.trim(), email, role: first ? 'owner' : 'organizer' };
      db.prepare('INSERT INTO users (id, name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, user.name, user.email, hash, salt, user.role);
      if (!first) db.prepare('UPDATE invites SET used = 1 WHERE hash = ?').run(digest(input.invite));
      record(user, first ? 'Criou a pelada compartilhada' : 'Entrou como organizador');
      return session(user);
    });
  }
  async function login(input) {
    requireValue(typeof input.password === 'string' && input.password.length <= 128, 'E-mail ou senha inválidos.', 401);
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(emailAddress(input.email));
    const hash = await passwordHash(input.password, user?.salt || '00000000000000000000000000000000');
    requireValue(user && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.password_hash, 'hex')), 'E-mail ou senha inválidos.', 401);
    requireValue(db.prepare('SELECT active FROM users WHERE id = ?').get(user.id)?.active, 'Esta conta foi desativada.', 401);
    return session(user);
  }
  function authenticate(value) {
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
    const user = db.prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id
      WHERE s.hash = ? AND s.expires > ? AND u.active = 1`).get(digest(value), Date.now());
    return user ? publicUser(user) : null;
  }
  function invite(actor) {
    authorize(actor);
    requireValue(actor.role === 'owner', 'Apenas o responsável pode convidar organizadores.', 403);
    const value = token();
    const expires = Date.now() + 86400000;
    db.prepare('DELETE FROM invites WHERE expires < ? OR used = 1').run(Date.now());
    transaction(() => {
      db.prepare('INSERT INTO invites (hash, created_by, expires) VALUES (?, ?, ?)').run(digest(value), actor.id, expires);
      record(actor, 'Criou um convite de organizador');
    });
    return { invite: value, expires };
  }
  function organizers() {
    return db.prepare('SELECT id, name, email, role, active FROM users ORDER BY name').all();
  }
  function revoke(actor, id) {
    requireValue(actor.role === 'owner', 'Apenas o responsável pode remover acessos.', 403);
    requireValue(id !== actor.id, 'Você não pode remover seu próprio acesso.');
    transaction(() => {
      authorize(actor);
      const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(id);
      requireValue(user && user.role !== 'owner', 'Organizador não encontrado.', 404);
      db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      record(actor, `Removeu o acesso de ${user.name}`);
    });
  }
  function action(actor, input) {
    return transaction(() => {
      authorize(actor);
      const { state, revision } = snapshot();
      requireValue(Number.isInteger(input.revision) && input.revision === revision,
        'Outro organizador atualizou a pelada. Os dados foram atualizados; revise e tente novamente.', 409);
      let description;
      switch (input.type) {
        case 'importLegacy': {
          requireValue(actor.role === 'owner', 'Apenas o responsável pode importar os dados iniciais.', 403);
          requireValue(!state.players.length && !state.matches.length && !state.teams.length, 'A importação inicial exige uma pelada vazia.', 409);
          const legacy = input.data;
          requireValue(legacy && Array.isArray(legacy.players) && legacy.players.length <= 500 && Array.isArray(legacy.matches) && legacy.matches.length <= 10000, 'Arquivo da versão anterior inválido.');
          const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
          requireValue(legacy.players.every(p => p && validId(p.id) && text(p.name, 50) && Number.isInteger(p.level) && p.level >= 1 && p.level <= 5), 'Jogadores da versão anterior inválidos.');
          requireValue(new Set(legacy.players.map(p => p.id)).size === legacy.players.length, 'Há jogadores duplicados no arquivo.');
          const validSide = side => Array.isArray(side) && side.length > 0 && side.length <= 500 && side.every(validId) && new Set(side).size === side.length;
          requireValue(legacy.matches.every(m => m && validId(m.id) && validSide(m.a) && validSide(m.b) && !m.a.some(id => m.b.includes(id)) && text(m.nameA) && text(m.nameB) && typeof m.date === 'string' && Number.isFinite(Date.parse(m.date)) && [m.scoreA, m.scoreB].every(n => Number.isInteger(n) && n >= 0 && n <= 999)), 'Partidas da versão anterior inválidas.');
          requireValue(new Set(legacy.matches.map(m => m.id)).size === legacy.matches.length, 'Há partidas duplicadas no arquivo.');
          state.players = legacy.players.map(p => ({ id: p.id, name: p.name.trim(), level: p.level }));
          state.matches = legacy.matches.map(m => ({ id: m.id, a: [...m.a], b: [...m.b], nameA: m.nameA.trim(), nameB: m.nameB.trim(), date: new Date(m.date).toISOString(), scoreA: m.scoreA, scoreB: m.scoreB, createdByName: 'Importação da versão local' }));
          description = 'Importou jogadores e partidas da versão local';
          break;
        }
        case 'addPlayer': {
          requireValue(state.players.length < 500, 'Limite de 500 jogadores atingido.');
          requireValue(text(input.name, 50), 'Informe um nome com até 50 caracteres.');
          requireValue(Number.isInteger(input.level) && input.level >= 1 && input.level <= 5, 'Nível inválido.');
          state.players.push({ id: randomUUID(), name: input.name.trim(), level: input.level });
          description = `Cadastrou ${input.name.trim()}`;
          break;
        }
        case 'updateLevel': {
          const player = state.players.find(p => p.id === input.id);
          requireValue(player, 'Jogador não encontrado.', 404);
          requireValue(Number.isInteger(input.level) && input.level >= 1 && input.level <= 5, 'Nível inválido.');
          player.level = input.level;
          description = `Alterou o nível de ${player.name}`;
          break;
        }
        case 'removePlayer': {
          const player = state.players.find(p => p.id === input.id);
          requireValue(player, 'Jogador não encontrado.', 404);
          state.players = state.players.filter(p => p.id !== input.id);
          state.teams = [];
          description = `Excluiu ${player.name}`;
          break;
        }
        case 'draw': {
          requireValue(Array.isArray(input.players) && input.players.length <= 500 && new Set(input.players).size === input.players.length, 'Seleção inválida.');
          requireValue(input.players.every(id => state.players.some(p => p.id === id)), 'Há um jogador que não está mais no elenco.');
          requireValue(Number.isInteger(input.count) && input.count >= 2 && input.count <= 6 && input.players.length >= input.count, 'Selecione pelo menos um jogador por time (2 a 6 times).');
          state.teams = drawTeams(state.players.filter(p => input.players.includes(p.id)), input.count)
            .map(t => ({ ...t, id: randomUUID() }));
          description = `Sorteou ${input.count} times`;
          break;
        }
        case 'addMatch': {
          requireValue(state.matches.length < 10000, 'Limite de 10 mil partidas atingido.');
          const a = state.teams.find(t => t.id === input.a), b = state.teams.find(t => t.id === input.b);
          requireValue(a && b && a !== b, 'Escolha dois times diferentes do sorteio atual.');
          requireValue([input.scoreA, input.scoreB].every(n => Number.isInteger(n) && n >= 0 && n <= 999), 'Informe gols inteiros entre 0 e 999.');
          state.matches.push({ id: randomUUID(), date: new Date().toISOString(), a: [...a.players], b: [...b.players],
            nameA: a.name, nameB: b.name, scoreA: input.scoreA, scoreB: input.scoreB,
            createdBy: actor.id, createdByName: actor.name });
          description = `Registrou ${a.name} ${input.scoreA} × ${input.scoreB} ${b.name}`;
          break;
        }
        case 'removeMatch': {
          requireValue(state.matches.some(m => m.id === input.id), 'Partida não encontrada.', 404);
          state.matches = state.matches.filter(m => m.id !== input.id);
          description = 'Excluiu uma partida';
          break;
        }
        default: requireValue(false, 'Operação desconhecida.');
      }
      db.prepare('UPDATE pelada SET revision = ?, data = ? WHERE id = 1').run(revision + 1, JSON.stringify(state));
      record(actor, description);
      return { state, revision: revision + 1 };
    });
  }
  function activity() {
    return db.prepare(`SELECT a.id, a.action, a.date, u.name FROM audit a
      JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 30`).all();
  }
  return { register, login, authenticate, invite, organizers, revoke, snapshot, action, activity, hasUsers,
    logout: value => { if (value) db.prepare('DELETE FROM sessions WHERE hash = ?').run(digest(value)); },
    close: () => db.close() };
}
