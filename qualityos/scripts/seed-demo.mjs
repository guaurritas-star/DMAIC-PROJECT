/**
 * Local-only demo fixture for Firebase Firestore emulator.
 * Never points at a real Firebase project, contains fictional information only.
 * Run after emulators:start --only firestore --project demo-qualityos.
 */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const PROJECT_ID = 'demo-qualityos';
const HOST = '127.0.0.1';
const PORT = 8080;
const NOW = Timestamp.now();

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: HOST, port: PORT },
});

const departments = [
  { id: 'direccion', name: 'Dirección', description: 'Objetivos y revisión del sistema' },
  { id: 'calidad', name: 'Calidad', description: 'Inspecciones, auditorías y documentación' },
  { id: 'produccion', name: 'Producción', description: 'Procesos de fabricación y control operativo' },
  { id: 'mantenimiento', name: 'Mantenimiento', description: 'Mantenimiento preventivo y correctivo' },
  { id: 'almacen', name: 'Almacén', description: 'Recepción, identificación y despacho' },
  { id: 'recursos-humanos', name: 'Recursos Humanos', description: 'Competencias, formación y personal' },
];

try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const org = 'planta-demo-leon';
    const base = ['organizations', org];
    const write = (parts, value) => setDoc(doc(db, ...parts), value);
    await write(base, {
      name: 'Planta Demo León',
      industry: 'Manufactura (ficticia)',
      status: 'demo',
      standards: ['ISO 9001', 'ISO 14001', 'ISO 45001'],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await write([...base, 'members', 'demo-owner'], {
      role: 'owner',
      active: true,
      displayName: 'Usuario de demostración',
      createdAt: NOW,
    });
    for (const d of departments) {
      await write([...base, 'departments', d.id], {
        name: d.name,
        description: d.description,
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
    await write([...base, 'processes', 'inspeccion-final'], {
      departmentId: 'calidad',
      name: 'Inspección de producto terminado',
      status: 'active',
      createdAt: NOW,
    });
    await write([...base, 'formTemplates', 'inspeccion-final-v1'], {
      departmentId: 'calidad',
      processId: 'inspeccion-final',
      name: 'Registro de inspección final',
      version: 1,
      status: 'draft',
      fields: [
        { key: 'lote', label: 'Lote', type: 'text', required: true },
        { key: 'espesor_um', label: 'Espesor (µm)', type: 'number', required: true },
        { key: 'minimo_um', label: 'Mínimo (µm)', type: 'number', required: true },
      ],
      createdAt: NOW,
    });
    await write([...base, 'records', 'inspeccion-demo-001'], {
      departmentId: 'calidad',
      templateId: 'inspeccion-final-v1',
      createdBy: 'demo-owner',
      status: 'draft',
      captureMode: 'manual_demo',
      values: { lote: 'DEMO-248', espesor_um: 18, minimo_um: 20 },
      createdAt: NOW,
    });
    await write([...base, 'audits', 'auditoria-demo-001'], {
      departmentIds: ['calidad', 'produccion'],
      title: 'Auditoría interna de ejemplo',
      status: 'planned',
      scheduledAt: NOW,
      createdAt: NOW,
    });
    await write([...base, 'findings', 'hallazgo-demo-001'], {
      auditId: 'auditoria-demo-001',
      departmentId: 'calidad',
      title: 'Registro de inspección por revisar',
      status: 'draft',
      evidenceRefs: ['inspeccion-demo-001'],
      createdAt: NOW,
    });
    await write([...base, 'correctiveActions', 'accion-demo-001'], {
      findingId: 'hallazgo-demo-001',
      title: 'Investigar el resultado fuera de especificación',
      status: 'open',
      createdAt: NOW,
    });
  });
  console.log('✅ Datos de demostración creados en el emulador local.');
  console.log('   Empresa ficticia: Planta Demo León');
  console.log('   Departamentos: 6 | Procesos: 1 | Plantillas: 1 | Registros: 1 | Auditorías: 1 | Hallazgos: 1');
  console.log('   UI: http://127.0.0.1:4000/firestore');
  console.log('   Solo demo-qualityos / 127.0.0.1:8080. NO se usó qualityos-d03dd.');
} finally {
  await env.cleanup();
}
