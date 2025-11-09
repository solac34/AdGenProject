import { Firestore } from "@google-cloud/firestore";

const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "eighth-upgrade-475017-u5";
const DATABASE_ID = process.env.FIRESTORE_DB_ID || "(default)";
const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;

let firestoreInstance: Firestore | null = null;
let isDevMode = process.env.NODE_ENV !== 'production';

// Mock Firestore for development
class MockFirestore {
  collection(name: string) {
    return {
      doc: (id: string) => ({
        get: async () => ({
          exists: false,
          data: () => null
        }),
        set: async () => ({ ok: true }),
        collection: (subName: string) => ({
          add: async () => ({ id: `mock-${Date.now()}` }),
          orderBy: () => ({
            limit: () => ({
              get: async () => ({
                docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>
              })
            })
          }),
          limit: () => ({
            get: async () => ({
              docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>
            })
          }),
          get: async () => ({
            docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>
          })
        })
      }),
      add: async () => ({ id: `mock-${Date.now()}` }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({
            docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>
          })
        })
      }),
      limit: () => ({
        get: async () => ({
          docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>
        })
      }),
      get: async () => ({
        docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>
      })
    };
  }
}

export function getFirestore(): any {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  // Always use mock in development, and also in production if no credentials
  if (isDevMode || (!SA_JSON && !KEYFILE)) {
    console.warn("[Firestore] Using mock Firestore (no credentials configured or dev mode)");
    return new MockFirestore() as any;
  }

  try {
    if (SA_JSON) {
      const credentials = typeof SA_JSON === "string" && SA_JSON.trim().startsWith("{")
        ? JSON.parse(SA_JSON)
        : JSON.parse(Buffer.from(SA_JSON as string, "base64").toString("utf8"));
      firestoreInstance = new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID, credentials });
    } else if (KEYFILE) {
      firestoreInstance = new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID, keyFilename: KEYFILE });
    } else {
      // Try application default credentials
      firestoreInstance = new Firestore({
        projectId: PROJECT_ID,
        databaseId: DATABASE_ID,
        ignoreUndefinedProperties: true
      });
    }

    return firestoreInstance;
  } catch (error) {
    console.warn("[Firestore] Failed to initialize, using mock:", error);

    // Always return mock instead of throwing (both dev and prod)
    return new MockFirestore() as any;
  }
}


