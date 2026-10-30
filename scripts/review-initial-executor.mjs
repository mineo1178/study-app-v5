// Independently approved production adapter. Importing this module never connects.
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { verifyInitialApproval, validateInitialEnvironment } from './review-initial-guard.mjs';
import { requireSafe, hash } from './review-admin-core.mjs';
export async function openApprovedInitialAdapter(input, sdkDirectory, environment = process.env, clock = Date.now) {
  validateInitialEnvironment(environment, input.policy.target);
  const approved = verifyInitialApproval({ ...input, now: clock() });
  requireSafe(typeof sdkDirectory === 'string' && sdkDirectory.length > 0, 'ADMIN_SDK_REQUIRED');
  const rq = createRequire(join(resolve(sdkDirectory), 'package.json')), sdk = rq('firebase-admin/app');
  let app, db;
  try {
    app = sdk.initializeApp({ projectId: approved.target.projectId, credential: sdk.applicationDefault() }, 'approved-initial-five');
    db = rq('firebase-admin/firestore').initializeFirestore(app, { preferRest: true });
    requireSafe(db.projectId === approved.target.projectId && app.options.projectId === approved.target.projectId, 'SDK_TARGET_MISMATCH');
    requireSafe(!db._settings?.host || db._settings.host === 'firestore.googleapis.com', 'SDK_ENDPOINT_REJECTED');
    const target = Object.freeze({ ...approved.target }), family = db.doc(`families/${target.familyId}`), ids = new Set(approved.questions.map(q => q.id));
    const question = id => { requireSafe(ids.has(id), 'QUESTION_ID_NOT_APPROVED'); return family.collection('reviewUsers').doc(target.uid).collection('questions').doc(id); };
    const read = async (requested, transaction) => {
      requireSafe(requested.length === 5 && hash([...requested].sort()) === hash([...ids].sort()), 'QUESTION_ID_NOT_APPROVED');
      const user = await rq('firebase-admin/auth').getAuth(app).getUser(target.uid);
      requireSafe(user.uid === target.uid && !user.disabled, 'TARGET_AUTH_INVALID');
      const get = ref => transaction ? transaction.get(ref) : ref.get();
      const f = await get(family); requireSafe(f.exists, 'FAMILY_MISSING');
      const rows = [];
      for (const id of requested) { const s = await get(question(id)); rows.push({ id, data: s.exists ? s.data() : null, updateTime: s.exists ? JSON.stringify(s.updateTime.toProto()) : null }); }
      return { members: f.data().memberUids, authValid: true, rows };
    };
    return {
      target, read: ids => read(ids),
      transaction: callback => db.runTransaction(async tx => {
        const queued = new Set();
        await callback({ read: ids => read(ids, tx), create: (id, data) => {
          requireSafe(!queued.has(id) && hash(data) === hash(approved.questions.find(q => q.id === id)), 'WRITE_NOT_APPROVED');
          queued.add(id); tx.create(question(id), data);
        } });
        requireSafe(queued.size === 5, 'INITIAL_FIVE_ONLY');
        validateInitialEnvironment(environment, approved.target);
        verifyInitialApproval({ ...input, now: clock() });
      }),
      close: async () => { await db.terminate(); await sdk.deleteApp(app); },
    };
  } catch (e) { await db?.terminate(); if (app) await sdk.deleteApp(app); throw e; }
}
