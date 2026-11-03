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
3. Test the implemented callable `createOrganization` bootstrap and verified-email requirement in local emulators, then configure rate limits and abuse controls.
4. Run `firebase emulators:exec` tests of cross-company isolation and permitted/denied operations before deploying rules.
5. Add Cloud Storage per-company file-access rules, limits and safe handling before enabling uploads.
6. Extend server-side audit logging and role transition tests, document versioning, backups and compliance/privacy requirements.
7. Connect Google AI Studio to the same Firebase project using the adapter in `client/qualityos-api.js` after configuring App Check and deploying a reviewed release.

From this folder, a configured Firebase CLI can deploy only the rules/index configuration with `firebase deploy --only firestore,storage --config firebase.json` — **do not deploy these untested draft rules to a live customer project**.

## Commercial readiness

Not production-ready: Firebase project exists but this branch is **not deployed**; callable functions, rules and frontend adapter are implemented locally but not yet fully integration-tested in the user's emulator or reviewed for production. No live tenant bootstrap, payments, document engine or enabled evidence storage.


## Phase 2: Companies / users / departments (development)

The following callable Cloud Functions were added in \`functions/index.js\`:

| Callable | Permission | Outcome |
|---|---|---|
| \`createOrganization\` | Google/Firebase signed-in user with verified email; one self-created organization per account | Creates company, verified owner membership, personal org index and audit event in one transaction |
| \`listMyOrganizations\` | Signed-in, verified email | Returns only active organizations belonging to the caller |
| \`createDepartment\` | owner/admin | Creates department and audit event |
| \`updateDepartment\` | owner/admin | Updates name/description or archives department (\`active=false\`) |
| \`createInvitation\` | owner/admin; only owner can invite admin | Issues one-use 7-day invitation for a specific email and role |
| \`acceptInvitation\` | Signed-in, verified email matching invitation | Atomically redeems invitation, creates membership and personal org index |
| \`updateMemberAccess\` | owner only | Changes another non-owner collaborator's role or activates/deactivates them |

Roles: \`owner\`, \`admin\`, \`auditor\`, \`lead\`, \`operator\`, \`viewer\`. The frontend must not be able to create companies, invites, membership records or departments without going through the trusted Cloud Functions. Company administrator may invite employees, and the generated invitation code must be delivered via a trusted channel; automatic email delivery is **not** implemented.

The permission test suite now protects the internal membership index and prevents browser access to invitations and department writes. **Security unit tests do not by themselves prove every Cloud Function flow is correct.** We included an additional emulator integration scenario for organizational onboarding and invitations.

### Local test commands (Windows PowerShell)

You previously cloned the \`feat/qualityos-backend-foundation\` branch into:
\`C:\Users\luisi\QualityOS-dev\qualityos\`.

1. Pull latest changes and install dependencies:

\`\`\`powershell
cd "$HOME\QualityOS-dev\qualityos"
git pull
npm.cmd install
cd .\functions
npm.cmd install
npm.cmd test
cd ..
\`\`\`

2. Stop the **previous** emulator (Ctrl+C in its window), then start all three services from the \`qualityos\` directory:

\`\`\`powershell
firebase.cmd emulators:start --only auth,firestore,functions --project demo-qualityos
\`\`\`

3. In a **second** PowerShell window run, one at a time:

\`\`\`powershell
cd "$HOME\QualityOS-dev\qualityos"
npm.cmd run test:rules
cd .\functions
npm.cmd run test:integration
\`\`\`

\`test:rules\` clears the **local Firestore emulator** between cases. This can remove your previous demonstration records; reload them afterward with \`npm.cmd run seed:demo\` from the \`qualityos\` directory. All tests and seeds explicitly target \`demo-qualityos\`, never \`qualityos-d03dd\`.

**Node 22 runtime** is configured for deployed functions. Check your local Node installation because your previous PowerShell output showed Node 20. A local mismatch may produce warnings or emulator incompatibility. Node 22 is preferred for function development; do not change the production runtime to an older decommissioned Node version.

### Costs and production gates

- The real Firebase project \`qualityos-d03dd\` is currently on **Spark**. Deploying Cloud Functions **requires Blaze with billing enabled**. Do not upgrade the plan or deploy without understanding the cost exposure.
- App Check is enforced for callables in production and bypassed only when the Firebase emulator sets \`FUNCTIONS_EMULATOR=true\`; configure App Check for the real web app before production requests.
- Protect the domain and control permitted login methods. Use a full role/tenant review, audit event retention strategy, query/index validation, backups and end-to-end tests before enabling real client data.
- Firestore's real database remains in its previously locked-down state until **reviewed** rules are explicitly deployed.
- The \`client/qualityos-api.js\` adapter is a contract for Google AI Studio, **not** a working UI. A browser-based preview hosted remotely cannot access your local \`127.0.0.1\` emulators.
- Nothing under this branch should be merged or deployed automatically.
