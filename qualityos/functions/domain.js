import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export const ROLES = Object.freeze(['owner', 'admin', 'auditor', 'lead', 'operator', 'viewer']);
export const INVITABLE_ROLES = Object.freeze(['admin', 'auditor', 'lead', 'operator', 'viewer']);

export function cleanText(value, field, max = 120) {
  if (typeof value !== 'string') throw new DomainError('invalid-argument', field + ' debe ser texto.');
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > max) throw new DomainError('invalid-argument', field + ' debe contener entre 1 y ' + max + ' caracteres.');
  return text;
}

export function optionalText(value, field, max = 500) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > max) throw new DomainError('invalid-argument', field + ' demasiado largo.');
  return value.trim();
}

export function id(value, field = 'ID') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{3,128}$/.test(value)) {
    throw new DomainError('invalid-argument', field + ' no válido.');
  }
  return value;
}

export function email(value) {
  if (typeof value !== 'string') throw new DomainError('invalid-argument', 'Correo no válido.');
  const out = value.trim().toLowerCase();
  if (out.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out)) {
    throw new DomainError('invalid-argument', 'Correo no válido.');
  }
  return out;
}

export function role(value) {
  if (!INVITABLE_ROLES.includes(value)) throw new DomainError('invalid-argument', 'Rol no permitido.');
  return value;
}

export function invitationCode() {
  const invitationId = randomBytes(16).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  return { invitationId, secret, code: invitationId + '.' + secret, hash: hashToken(secret) };
}
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
export function decodeCode(code) {
  if (typeof code !== 'string') throw new DomainError('invalid-argument', 'Invitación no válida.');
  const pieces = code.split('.');
  if (pieces.length !== 2 || !/^[a-f0-9]{32}$/.test(pieces[0]) || !/^[A-Za-z0-9_-]{40,50}$/.test(pieces[1])) {
    throw new DomainError('invalid-argument', 'Invitación no válida.');
  }
  return { invitationId: pieces[0], secret: pieces[1] };
}
export function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
