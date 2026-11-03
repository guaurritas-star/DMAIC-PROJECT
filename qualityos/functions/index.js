import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  DomainError, cleanText, optionalText, id, email, role,
  invitationCode, decodeCode, hashToken, sameHash,
} from './domain.js';

initializeApp();
const db = getFirestore();
const REGION = 'us-south1'; // Closest currently documented Firebase Functions region to MX Firestore.
// Keep App Check enforced in production. Local emulators do not have a real App Check token.
const OPTIONS = {
  region: REGION,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 5,
  timeoutSeconds: 30,
};
const TS = () => FieldValue.serverTimestamp();
const orgRef = (orgId) => db.doc('organizations/' + id(orgId, 'Organización'));
const memberRef = (orgId, uid) => orgRef(orgId).collection('members').doc(uid);
const linkRef = (uid, orgId) => db.doc('users/' + uid + '/orgMemberships/' + orgId);
const eventRef = (orgId) => orgRef(orgId).collection('auditLog').doc();
const event = (type, uid, details = {}) => ({ type, actorUid: uid, details, createdAt: TS() });

function requireUser(request) {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  if (auth.token.email_verified !== true || !auth.token.email) {
    throw new HttpsError('permission-denied', 'Verifica el correo de tu cuenta antes de continuar.');
  }
  return { uid: auth.uid, email: email(auth.token.email) };
}

function wrap(fn) {
  return onCall(OPTIONS, async (request) => {
    try { return await fn(request); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof DomainError) throw new HttpsError(error.code, error.message);
      console.error('QualityOS trusted operation failed', error);
      throw new HttpsError('internal', 'No se pudo completar la operación.');
    }
  });
}

async function requireRole(orgId, uid, allowed, trx = null) {
  const ref = memberRef(orgId, uid);
  const snapshot = trx ? await trx.get(ref) : await ref.get();
  if (!snapshot.exists || snapshot.get('active') !== true || !allowed.includes(snapshot.get('role'))) {
    throw new HttpsError('permission-denied', 'No tienes permisos para esta organización.');
  }
  return snapshot.get('role');
}

/** An email-verified user may bootstrap one organization; owner identity is always request.auth.uid. */
export const createOrganization = wrap(async (request) => {
  const { uid, email: userEmail } = requireUser(request);
  const name = cleanText(request.data?.name, 'Empresa', 120);
  const industry = optionalText(request.data?.industry, 'Giro', 120);
  const ownerGuard = db.doc('userAccounts/' + uid);
  const organization = db.collection('organizations').doc();
  await db.runTransaction(async (trx) => {
    const previous = await trx.get(ownerGuard);
    if (previous.exists) throw new HttpsError('already-exists', 'Esta cuenta ya creó una empresa.');
    trx.create(ownerGuard, { createdOrgId: organization.id, createdAt: TS() });
    trx.create(organization, { name, industry, status: 'trial', standards: [], createdBy: uid, createdAt: TS(), updatedAt: TS() });
    trx.create(memberRef(organization.id, uid), { role: 'owner', active: true, email: userEmail, createdAt: TS(), invitedBy: null });
    trx.create(linkRef(uid, organization.id), { active: true, role: 'owner', createdAt: TS() });
    trx.create(eventRef(organization.id), event('organization.created', uid));
  });
  return { organizationId: organization.id };
});

/** Index has only organizations this user belongs to; no global company collection query. */
export const listMyOrganizations = wrap(async (request) => {
  const { uid } = requireUser(request);
  const links = await db.collection('users/' + uid + '/orgMemberships').limit(50).get();
  const items = await Promise.all(links.docs.map(async (link) => {
    if (link.get('active') !== true) return null;
    const orgId = link.id;
    const [company, membership] = await Promise.all([orgRef(orgId).get(), memberRef(orgId, uid).get()]);
    if (!company.exists || !membership.exists || membership.get('active') !== true) return null;
    return { id: orgId, name: company.get('name'), role: membership.get('role'), industry: company.get('industry') || '' };
  }));
  return { organizations: items.filter(Boolean) };
});

export const createDepartment = wrap(async (request) => {
  const { uid } = requireUser(request);
  const orgId = id(request.data?.organizationId, 'Organización');
  const name = cleanText(request.data?.name, 'Departamento', 100);
  const description = optionalText(request.data?.description, 'Descripción', 300);
  const department = orgRef(orgId).collection('departments').doc();
  await db.runTransaction(async (trx) => {
    await requireRole(orgId, uid, ['owner', 'admin'], trx);
    const org = await trx.get(orgRef(orgId));
    if (!org.exists) throw new HttpsError('not-found', 'Empresa inexistente.');
    trx.create(department, { name, description, active: true, createdBy: uid, createdAt: TS(), updatedAt: TS() });
    trx.create(eventRef(orgId), event('department.created', uid, { departmentId: department.id }));
  });
  return { departmentId: department.id };
});

export const updateDepartment = wrap(async (request) => {
  const { uid } = requireUser(request);
  const orgId = id(request.data?.organizationId, 'Organización');
  const departmentId = id(request.data?.departmentId, 'Departamento');
  const patch = {};
  if (Object.hasOwn(request.data || {}, 'name')) patch.name = cleanText(request.data.name, 'Departamento', 100);
  if (Object.hasOwn(request.data || {}, 'description')) patch.description = optionalText(request.data.description, 'Descripción', 300);
  if (Object.hasOwn(request.data || {}, 'active')) {
    if (typeof request.data.active !== 'boolean') throw new HttpsError('invalid-argument', 'Estado no válido.');
    patch.active = request.data.active;
  }
  if (!Object.keys(patch).length) throw new HttpsError('invalid-argument', 'No hay cambios.');
  const department = orgRef(orgId).collection('departments').doc(departmentId);
  await db.runTransaction(async (trx) => {
    await requireRole(orgId, uid, ['owner', 'admin'], trx);
    const snapshot = await trx.get(department);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Departamento inexistente.');
    trx.update(department, { ...patch, updatedAt: TS() });
    trx.create(eventRef(orgId), event('department.updated', uid, { departmentId, fields: Object.keys(patch) }));
  });
  return { updated: true };
});

/** Invitation is a one-time secret. We store only SHA-256 of its secret and email binding. */
export const createInvitation = wrap(async (request) => {
  const { uid } = requireUser(request);
  const orgId = id(request.data?.organizationId, 'Organización');
  const targetEmail = email(request.data?.email);
  const invitedRole = role(request.data?.role);
  const invite = invitationCode(orgId);
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const inviteRef = orgRef(orgId).collection('invitations').doc(invite.invitationId);
  await db.runTransaction(async (trx) => {
    const requesterRole = await requireRole(orgId, uid, ['owner', 'admin'], trx);
    // Only owners can invite another administrator.
    if (invitedRole === 'admin' && requesterRole !== 'owner') {
      throw new HttpsError('permission-denied', 'Solo el propietario puede invitar administradores.');
    }
    trx.create(inviteRef, {
      email: targetEmail, role: invitedRole, tokenHash: invite.hash,
      status: 'pending', invitedBy: uid, createdAt: TS(), expiresAt,
    });
    trx.create(eventRef(orgId), event('invitation.created', uid, { invitationId: invite.invitationId, role: invitedRole }));
  });
  // Show once; admin must deliver securely; no plaintext token is persisted in Firestore.
  return { code: invite.code, expiresAt: expiresAt.toDate().toISOString() };
});

export const acceptInvitation = wrap(async (request) => {
  const { uid, email: userEmail } = requireUser(request);
  const { orgId, invitationId, secret } = decodeCode(request.data?.code);
  const inviteRef = orgRef(orgId).collection('invitations').doc(invitationId);
  const membership = memberRef(orgId, uid);
  await db.runTransaction(async (trx) => {
    const invite = await trx.get(inviteRef);
    const existingMember = await trx.get(membership);
    if (!invite.exists) throw new HttpsError('not-found', 'Invitación no encontrada.');
    const data = invite.data();
    if (!sameHash(data.tokenHash, hashToken(secret)) ||
        data.status !== 'pending' || data.email !== userEmail ||
        !data.expiresAt?.toMillis || data.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('permission-denied', 'La invitación no es válida, ha expirado o pertenece a otro correo.');
    }
    if (existingMember.exists) throw new HttpsError('already-exists', 'Ya perteneces a esta organización.');
    if (!['admin', 'auditor', 'lead', 'operator', 'viewer'].includes(data.role)) {
      throw new HttpsError('failed-precondition', 'Rol de invitación no válido.');
    }
    trx.create(membership, {
      email: userEmail, role: data.role, active: true, createdAt: TS(), invitedBy: data.invitedBy,
    });
    trx.create(linkRef(uid, orgId), { active: true, role: data.role, createdAt: TS() });
    trx.update(inviteRef, { status: 'accepted', acceptedAt: TS(), acceptedBy: uid });
    trx.create(eventRef(orgId), event('invitation.accepted', uid, { invitationId }));
  });
  return { organizationId: orgId };
});

/** An owner can change non-owner members; the original owner cannot be demoted or disabled. */
export const updateMemberAccess = wrap(async (request) => {
  const { uid } = requireUser(request);
  const orgId = id(request.data?.organizationId, 'Organización');
  const targetUid = id(request.data?.memberUid, 'Usuario');
  const newRole = role(request.data?.role);
  if (typeof request.data?.active !== 'boolean') throw new HttpsError('invalid-argument', 'Estado no válido.');
  if (uid === targetUid) throw new HttpsError('failed-precondition', 'No puedes cambiar tu propio acceso.');
  await db.runTransaction(async (trx) => {
    await requireRole(orgId, uid, ['owner'], trx);
    const target = memberRef(orgId, targetUid);
    const existing = await trx.get(target);
    if (!existing.exists) throw new HttpsError('not-found', 'Colaborador inexistente.');
    if (existing.get('role') === 'owner') throw new HttpsError('failed-precondition', 'No es posible cambiar al propietario.');
    trx.update(target, { role: newRole, active: request.data.active, updatedAt: TS() });
    trx.set(linkRef(targetUid, orgId), { role: newRole, active: request.data.active, updatedAt: TS() }, { merge: true });
    trx.create(eventRef(orgId), event('member.access.updated', uid, { memberUid: targetUid, role: newRole, active: request.data.active }));
  });
  return { updated: true };
});
