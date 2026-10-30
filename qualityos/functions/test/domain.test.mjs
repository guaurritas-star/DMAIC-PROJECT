import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText, optionalText, id, email, role, invitationCode, decodeCode, hashToken, sameHash
} from '../domain.js';

test('normaliza los nombres y limita cadenas no válidas', () => {
  assert.equal(cleanText('  Calidad   Industrial  ', 'Departamento'), 'Calidad Industrial');
  assert.equal(optionalText(null, 'Descripción'), '');
  assert.throws(() => cleanText(' ', 'Departamento'));
  assert.throws(() => cleanText('x'.repeat(121), 'Departamento'));
  assert.throws(() => optionalText('x'.repeat(501), 'Descripción'));
});

test('rechaza IDs extraños y correos inválidos', () => {
  assert.equal(id('org_ab-12'), 'org_ab-12');
  assert.equal(email(' USUARIO@EJEMPLO.COM '), 'usuario@ejemplo.com');
  assert.throws(() => id('../secret'));
  assert.throws(() => email('nadie@'));
});

test('nunca acepta invitaciones con rol owner', () => {
  assert.equal(role('operator'), 'operator');
  assert.equal(role('admin'), 'admin');
  assert.throws(() => role('owner'));
  assert.throws(() => role('superadmin'));
});

test('las invitaciones usan token aleatorio, hash SHA256 y tenant explícito', () => {
  const a = invitationCode('org-demo');
  const b = invitationCode('org-demo');
  assert.notEqual(a.code, b.code);
  assert.equal(a.hash, hashToken(a.secret));
  assert.equal(a.hash.length, 64);
  assert.equal(decodeCode(a.code).orgId, 'org-demo');
  assert.equal(decodeCode(a.code).invitationId, a.invitationId);
  assert.ok(sameHash(a.hash, hashToken(a.secret)));
  assert.ok(!sameHash(a.hash, hashToken(b.secret)));
  assert.ok(!a.code.includes(a.hash));
  assert.throws(() => decodeCode('broken'));
  assert.throws(() => decodeCode('../invalid.token.secret'));
  assert.ok(!sameHash('', a.hash));
});
