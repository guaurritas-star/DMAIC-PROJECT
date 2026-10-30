# QualityOS — Firebase backend foundation (draft)

This is a **separate, non-deployed foundation**. It does not replace the legacy DMAIC prototype in `index.html` or `worker/index.js`.

## Technology

- **Frontend:** Google AI Studio (web, responsive) — separate project.
- **Identity:** Firebase Authentication (Google and/or email).
- **Application records:** Cloud Firestore (not Firebase Realtime Database).
- **Evidence files:** Cloud Storage for Firebase; **disabled until secure upload flow is implemented**.
- **Trusted operations:** Cloud Functions / Cloud Run (tenant provisioning, membership changes, audit events, report generation, AI processing).
- **Later:** BigQuery or another analytical store for complex cross-record analytics.

Google AI Studio Build mode supports connecting Firebase to web apps: https://firebase.google.com/docs/ai-assistance/ai-studio-integration

## Collections

All business data lives inside a company boundary:

```
organizations/{orgId}                        // Company name, industry, plan
  members/{uid}                             // role, active (trusted backend only)
  departments/{departmentId}                // name, description, active
  processes/{processId}                     // departmentId, owner, description
  formTemplates/{templateId}                // departmentId, fields, version, status
  records/{recordId}                        // departmentId, templateId, values, status, createdBy
  audits/{auditId}                          // scope, departments, planned date, status
  findings/{findingId}                      // auditId, requirementRef, observation, evidenceRefs
  correctiveActions/{actionId}              // findingId, owner, dueAt, status, efficacyReview
  documents/{documentId}                    // controlled document metadata/version
  auditLog/{eventId}                        // immutable server-written events
```

**Global ISO framework references and licensed norm content are not implemented**. Norm applicability is tracked independently from company organization and department: one evidence may be linked to several requirements after human review. Do not store protected normative text without appropriate permission.

### Example department

```json
{
  "name": "Calidad",
  "description": "Inspección y control de productos",
  "active": true,
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

### Example record (created as DRAFT)

```json
{
  "departmentId": "calidad",
  "templateId": "inspeccion-espesor-v1",
  "values": { "lote": "DEMO-248", "espesor": 18, "minimo": 20, "unidad": "µm" },
  "status": "draft",
  "createdBy": "<Firebase Auth uid>",
  "captureMode": "voice_reviewed",
  "createdAt": "<Firestore Timestamp>"
}
```

An AI transcript is **untrusted proposed input**, never a validated inspection. Display parsed fields for human confirmation, preserve the source/provenance and audit trail, and never authorize product release automatically.

## Access model

| Role | Read | Data entry | Templates / processes | Audit / findings | Manage departments |
|---|---|---|---|---|---|
| owner/admin | Yes | Yes | Yes | Yes | Yes |
| auditor | Yes | Yes | Yes | Yes | No |
| lead | Yes | Yes | Yes | No | No |
| operator | Yes | Draft + submit own records | No | No | No |
| viewer | Yes | No | No | No | No |

**Roles and organization creation can only be set by trusted server code**, not by the frontend. Client access is denied unless an active membership document exists. Reports, approvals, actions and other privileged transitions need a hardened server workflow before production. These rules are an initial conservative draft and require emulator tests and security review.

## Deployment prerequisites — NOT COMPLETE

1. Create or select a Firebase project under the account that will own QualityOS; choose region and data residency appropriate for customer contracts.
2. Enable Authentication and Cloud Firestore; carefully configure allowed sign-in methods.
3. Set up a trusted bootstrap flow (Firebase Admin SDK) to create an organization and the **first** owner membership. Do not allow self-assigned roles.
4. Run `firebase emulators:exec` tests of cross-company isolation and permitted/denied operations before deploying rules.
5. Add Cloud Storage per-company file-access rules, limits and safe handling before enabling uploads.
6. Implement server-side audits, immutable evidence tracking, document versioning, backups and compliance/privacy requirements.
7. Connect Google AI Studio to the same Firebase project and generate a web UI against this schema.

From this folder, a configured Firebase CLI can deploy only the rules/index configuration with `firebase deploy --only firestore,storage --config firebase.json` — **do not deploy these untested draft rules to a live customer project**.

## Commercial readiness

Not production-ready: no live Firebase project, no deployed database, no Cloud Functions, no tests, no invoices/payment, no fully implemented tenant bootstrap, and file storage is intentionally locked.
