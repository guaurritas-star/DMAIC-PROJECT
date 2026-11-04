/**
 * Integration test against ONLY local demo-qualityos emulators.
 * Start from the qualityos directory:
 * firebase.cmd emulators:start --only auth,firestore,functions --project demo-qualityos
 * In another window: cd functions && npm.cmd run test:integration
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'demo-qualityos';
const HOST = '127.0.0.1';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIRESTORE_EMULATOR_HOST = HOST + ':8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = HOST + ':9099';

const APP_URL = 'http://' + HOST + ':5001/' + PROJECT + '/us-south1/';
const AUTH_URL = 'http://' + HOST + ':9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-qualityos';

async function checkLocalEmulators() {
  const url = 'http://' + HOST + ':4400/emulators';
  let response;
  try { response = await fetch(url); } catch {
    throw new Error('Emuladores no disponibles en 127.0.0.1. No se llamó a producción.');
  }
  if (!response.ok) throw new Error('No fue posible verificar los emuladores locales.');
  const emulators = await response.json();
  for (const name of ['firestore', 'auth', 'functions']) {
    if (!emulators[name]) throw new Error('El emulador ' + name + ' no está iniciado.');
  }
}

async function createTestUser(adminApp) {
  const userEmail = 'qualityos-test-' + randomUUID().slice(0, 8) + '@example.org';
  const password = 'OnlyLocal-Strong-' + randomUUID();
  const created = await getAuth(adminApp).createUser({
    email: userEmail,
    password,
    emailVerified: true,
  });
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password, returnSecureToken: true }),
  });
  const data = await response.json();
  if (!response.ok || !data.idToken) throw new Error('No fue posible autenticar al usuario en el emulador.');
  return { uid: created.uid, token: data.idToken };
}

async function call(name, token, data = {}) {
  const response = await fetch(APP_URL + name, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  return { ok: response.ok, result: body.result, error: body.error };
}

test('flujo real: alta de empresa, departamentos e invitaciones con aislamiento', async () => {
  await checkLocalEmulators();
  const adminApp = initializeApp({ projectId: PROJECT }, 'test-' + randomUUID());
  try {
    const db = getFirestore(adminApp);
    const alice = await createTestUser(adminApp);
    const bob = await createTestUser(adminApp);
    const other = await createTestUser(adminApp);

    const initial = await call('createOrganization', alice.token, { name: 'Planta Prueba', industry: 'Empaque' });
    assert.equal(initial.ok, true, JSON.stringify(initial.error));
    const orgId = initial.result.organizationId;
    assert.ok(orgId);
    const owner = await db.doc('organizations/' + orgId + '/members/' + alice.uid).get();
    assert.equal(owner.get('role'), 'owner');
    assert.equal(owner.get('active'), true);

    const listA = await call('listMyOrganizations', alice.token);
    assert.equal(listA.ok, true, JSON.stringify(listA.error));
    assert.ok(listA.result.organizations.some((org) => org.id === orgId));

    const duplicate = await call('createOrganization', alice.token, { name: 'Duplicada' });
    assert.equal(duplicate.ok, false);

    const unauthorizedDepartment = await call('createDepartment', bob.token, {
      organizationId: orgId, name: 'Calidad',
    });
    assert.equal(unauthorizedDepartment.ok, false);

    const createdDepartment = await call('createDepartment', alice.token, {
      organizationId: orgId, name: 'Calidad', description: 'Calidad y mejora',
    });
    assert.equal(createdDepartment.ok, true, JSON.stringify(createdDepartment.error));
    const departmentId = createdDepartment.result.departmentId;
    const department = db.doc('organizations/' + orgId + '/departments/' + departmentId);
    assert.equal((await department.get()).get('name'), 'Calidad');

    const renamed = await call('updateDepartment', alice.token, {
      organizationId: orgId, departmentId, name: 'Aseguramiento de Calidad',
    });
    assert.equal(renamed.ok, true, JSON.stringify(renamed.error));
    assert.equal((await department.get()).get('name'), 'Aseguramiento de Calidad');

    const invite = await call('createInvitation', alice.token, {
      organizationId: orgId, email: (await getAuth(adminApp).getUser(bob.uid)).email, role: 'operator',
    });
    assert.equal(invite.ok, true, JSON.stringify(invite.error));
    assert.ok(invite.result.code.startsWith(orgId + '.'));

    const wrongEmail = await call('acceptInvitation', other.token, { code: invite.result.code });
    assert.equal(wrongEmail.ok, false);

    const accepted = await call('acceptInvitation', bob.token, { code: invite.result.code });
    assert.equal(accepted.ok, true, JSON.stringify(accepted.error));
    const memberB = db.doc('organizations/' + orgId + '/members/' + bob.uid);
    assert.equal((await memberB.get()).get('role'), 'operator');

    const repeated = await call('acceptInvitation', bob.token, { code: invite.result.code });
    assert.equal(repeated.ok, false);

    const bobCreatesDepartment = await call('createDepartment', bob.token, {
      organizationId: orgId, name: 'Producción',
    });
    assert.equal(bobCreatesDepartment.ok, false);

    const bobList = await call('listMyOrganizations', bob.token);
    assert.ok(bobList.result.organizations.some((org) => org.id === orgId));

    const revoked = await call('updateMemberAccess', alice.token, {
      organizationId: orgId, memberUid: bob.uid, role: 'viewer', active: false,
    });
    assert.equal(revoked.ok, true, JSON.stringify(revoked.error));
    const inactiveList = await call('listMyOrganizations', bob.token);
    assert.ok(!inactiveList.result.organizations.some((org) => org.id === orgId));

    const forbiddenSelfDemotion = await call('updateMemberAccess', alice.token, {
      organizationId: orgId, memberUid: alice.uid, role: 'viewer', active: false,
    });
    assert.equal(forbiddenSelfDemotion.ok, false);

    const logs = await db.collection('organizations/' + orgId + '/auditLog').get();
    assert.ok(logs.size >= 5);
  } finally {
    await deleteApp(adminApp);
  }
});
