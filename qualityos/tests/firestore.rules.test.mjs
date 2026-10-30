import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-qualityos';
const RULES = readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8');

let env;
const path = (org, col, id) => ['organizations', org, col, id];

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: RULES },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const entries = [
      ['organizations/org-a', { name: 'Empresa A' }],
      ['organizations/org-b', { name: 'Empresa B' }],
      ['organizations/org-a/members/owner-a', { role: 'owner', active: true }],
      ['organizations/org-a/members/operator-a', { role: 'operator', active: true }],
      ['organizations/org-a/members/viewer-a', { role: 'viewer', active: true }],
      ['organizations/org-a/members/auditor-a', { role: 'auditor', active: true }],
      ['organizations/org-b/members/owner-b', { role: 'owner', active: true }],
      ['organizations/org-a/departments/quality', {
        name: 'Calidad', active: true, createdAt: 'demo', updatedAt: 'demo',
      }],
      ['organizations/org-b/departments/quality', {
        name: 'Calidad de B', active: true, createdAt: 'demo', updatedAt: 'demo',
      }],
      ['organizations/org-a/records/existing', {
        createdBy: 'operator-a', departmentId: 'quality', templateId: 'checklist',
        values: { lote: 'DEMO-01' }, status: 'draft',
      }],
    ];
    for (const [p, value] of entries) {
      await setDoc(doc(db, p), value);
    }
  });
});

after(async () => {
  if (env) await env.cleanup();
});

const context = (uid) => env.authenticatedContext(uid).firestore();

test('sin inicio de sesión no puede ver datos de una empresa', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), ...path('org-a', 'departments', 'quality'))));
});

test('la empresa A no puede leer registros de la empresa B', async () => {
  await assertFails(getDoc(doc(context('owner-a'), ...path('org-b', 'departments', 'quality'))));
  await assertSucceeds(getDoc(doc(context('owner-b'), ...path('org-b', 'departments', 'quality'))));
});

test('un usuario activo puede leer su propio departamento', async () => {
  await assertSucceeds(getDoc(doc(context('operator-a'), ...path('org-a', 'departments', 'quality'))));
});

test('solo dirección/administración puede crear departamentos', async () => {
  const payload = { name: 'Producción', description: '', active: true, createdAt: 'now', updatedAt: 'now' };
  await assertFails(setDoc(doc(context('operator-a'), ...path('org-a', 'departments', 'production')), payload));
  await assertSucceeds(setDoc(doc(context('owner-a'), ...path('org-a', 'departments', 'production')), payload));
});

test('el operador puede crear un borrador propio', async () => {
  await assertSucceeds(setDoc(doc(context('operator-a'), ...path('org-a', 'records', 'own-draft')), {
    createdBy: 'operator-a', departmentId: 'quality', templateId: 'checklist',
    values: { lote: 'DEMO-02' }, status: 'draft',
  }));
});

test('el operador no puede atribuirse registros de otra persona ni guardar directamente como aprobado', async () => {
  const base = { departmentId: 'quality', templateId: 'checklist', values: { lote: 'DEMO-03' } };
  await assertFails(setDoc(doc(context('operator-a'), ...path('org-a', 'records', 'fake-author')),
    { ...base, createdBy: 'owner-a', status: 'draft' }));
  await assertFails(setDoc(doc(context('operator-a'), ...path('org-a', 'records', 'approved')),
    { ...base, createdBy: 'operator-a', status: 'approved' }));
});

test('un usuario de solo lectura no puede crear registros', async () => {
  await assertFails(setDoc(doc(context('viewer-a'), ...path('org-a', 'records', 'viewer-created')), {
    createdBy: 'viewer-a', departmentId: 'quality', templateId: 'checklist',
    values: {}, status: 'draft',
  }));
});

test('un operador puede enviar su borrador, pero no alterarlo después', async () => {
  const ref = doc(context('operator-a'), ...path('org-a', 'records', 'existing'));
  await assertSucceeds(updateDoc(ref, { status: 'submitted', updatedAt: 'now' }));
  await assertFails(updateDoc(ref, { values: { lote: 'ALTERADO' }, updatedAt: 'later' }));
});

test('los datos de identidad, departamento y plantilla de un registro son inmutables', async () => {
  const ref = doc(context('operator-a'), ...path('org-a', 'records', 'existing'));
  await assertFails(updateDoc(ref, { departmentId: 'another' }));
  await assertFails(updateDoc(ref, { templateId: 'another' }));
  await assertFails(updateDoc(ref, { createdBy: 'owner-a' }));
  await assertSucceeds(updateDoc(ref, { values: { lote: 'DEMO-01', espesor: 18 } }));
});

test('el operador no puede editar el registro ajeno', async () => {
  const ref = doc(context('owner-a'), ...path('org-a', 'records', 'foreign'));
  await assertSucceeds(setDoc(ref, {
    createdBy: 'owner-a', departmentId: 'quality', templateId: 'checklist',
    values: {}, status: 'draft',
  }));
  await assertFails(updateDoc(doc(context('operator-a'), ...path('org-a', 'records', 'foreign')),
    { values: { lote: 'X' } }));
});

test('el usuario no puede inscribirse como administrador ni crear empresas por su cuenta', async () => {
  await assertFails(setDoc(doc(context('operator-a'), ...path('org-a', 'members', 'new-admin')),
    { role: 'owner', active: true }));
  await assertFails(setDoc(doc(context('owner-a'), 'organizations', 'org-c'), { name: 'Empresa fantasma' }));
});

test('solo roles autorizados pueden registrar hallazgos de auditoría', async () => {
  const finding = { description: 'Hallazgo ficticio', status: 'draft' };
  await assertFails(setDoc(doc(context('operator-a'), ...path('org-a', 'findings', 'f-1')), finding));
  await assertSucceeds(setDoc(doc(context('auditor-a'), ...path('org-a', 'findings', 'f-2')), finding));
});

test('el acceso a rutas desconocidas permanece bloqueado', async () => {
  await assertFails(setDoc(doc(context('owner-a'), 'global-secrets', 'unsafe'), { value: 1 }));
});
