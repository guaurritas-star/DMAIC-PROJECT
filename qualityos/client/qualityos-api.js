/**
 * QualityOS SDK adapter for a React/Vite frontend built in Google AI Studio.
 * Pass an already-initialized Firebase web app; DO NOT pass service-account credentials.
 * Requires Firebase Authentication, Firestore and deployed callable functions.
 */
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, connectAuthEmulator } from 'firebase/auth';
import {
  getFirestore, collection, query, orderBy, onSnapshot, connectFirestoreEmulator,
} from 'firebase/firestore';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

export function createQualityOSClient(app, { localEmulators = false } = {}) {
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'us-south1');

  if (localEmulators) {
    // Do not enable in a hosted Google AI Studio preview; 127.0.0.1 is the viewer's machine.
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }

  const call = (name, data = {}) => httpsCallable(functions, name)(data).then((response) => response.data);
  return {
    auth,
    loginWithGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
    logout: () => signOut(auth),
    createOrganization: (name, industry = '') => call('createOrganization', { name, industry }),
    listMyOrganizations: () => call('listMyOrganizations'),
    createDepartment: (organizationId, name, description = '') =>
      call('createDepartment', { organizationId, name, description }),
    updateDepartment: (organizationId, departmentId, patch) =>
      call('updateDepartment', { organizationId, departmentId, ...patch }),
    createInvitation: (organizationId, email, role) =>
      call('createInvitation', { organizationId, email, role }),
    acceptInvitation: (code) => call('acceptInvitation', { code }),
    updateMemberAccess: (organizationId, memberUid, role, active) =>
      call('updateMemberAccess', { organizationId, memberUid, role, active }),
    watchDepartments: (organizationId, onData, onError) =>
      onSnapshot(
        query(collection(db, 'organizations', organizationId, 'departments'), orderBy('name')),
        (snapshot) => onData(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
        onError
      ),
  };
}
