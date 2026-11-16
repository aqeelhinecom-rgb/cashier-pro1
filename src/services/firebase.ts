import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore (with specific database ID if provisioned)
export const firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Configure Google OAuth Provider with Google Drive Scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.appdata');
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-Memory Token Cache (DO NOT store in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Test connection to Firestore
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(firestore, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is running in offline mode or network is unreachable.');
      return false;
    }
    // Permissions error or missing doc is normal for test doc; connection itself reached server
    return true;
  }
}

// Initialize Auth Listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign In with Google & Request Drive Scopes
export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;

    if (token) {
      cachedAccessToken = token;
    }

    // Save/update user profile in Firestore
    if (result.user) {
      try {
        await setDoc(
          doc(firestore, 'users', result.user.uid),
          {
            userId: result.user.uid,
            email: result.user.email || '',
            displayName: result.user.displayName || '',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Could not sync user profile to Firestore:', err);
      }
    }

    return { user: result.user, accessToken: cachedAccessToken || '' };
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign Out
export const signOutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};

// Access Token Getter
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Current Auth User Getter
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// ==========================================
// Google Drive API Integration Functions
// ==========================================

export interface DriveFileItem {
  id: string;
  name: string;
  createdTime?: string;
  size?: string;
}

/**
 * Finds or creates a dedicated "Cashier_Backups" folder in user's Google Drive
 */
async function getOrCreateDriveBackupFolder(token: string): Promise<string | null> {
  try {
    const q = "mimeType='application/vnd.google-apps.folder' and name='Cashier_Backups' and trashed=false";
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Create folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Cashier_Backups',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (!createRes.ok) return null;
    const folderData = await createRes.json();
    return folderData.id;
  } catch (err) {
    console.error('Error getting Drive folder:', err);
    return null;
  }
}

import { generateBackupFileName } from './dbFormat';

/**
 * Uploads a Cashier backup (.db SQLite binary or JSON) directly to Google Drive
 */
export async function uploadBackupToGoogleDrive(
  data: string | Uint8Array,
  customName?: string
): Promise<{ id: string; name: string }> {
  const token = cachedAccessToken;
  if (!token) {
    throw new Error('لم يتم تسجيل الدخول إلى Google Drive أو انتهت صلاحية الجلسة');
  }

  const folderId = await getOrCreateDriveBackupFolder(token);
  const fileName = customName || generateBackupFileName('autoSave');
  const isBinary = data instanceof Uint8Array;
  const mimeType = isBinary ? 'application/x-sqlite3' : 'application/json';

  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: fileName,
    mimeType: mimeType,
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metaPart = new TextEncoder().encode(
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const dataBytes: BlobPart = typeof data === 'string' ? data : (data.buffer as ArrayBuffer);
  const endPart = new TextEncoder().encode(closeDelim);

  const combinedBody = new Blob([metaPart.buffer as ArrayBuffer, dataBytes, endPart.buffer as ArrayBuffer]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combinedBody,
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`فشل رفع النسخة الاحتياطية على Google Drive: ${errorText}`);
  }

  return await res.json();
}

/**
 * Lists Cashier backup files from Google Drive
 */
export async function listGoogleDriveBackups(): Promise<DriveFileItem[]> {
  const token = cachedAccessToken;
  if (!token) return [];

  try {
    const q = "(name contains 'data' or name contains 'autoSave' or name contains 'Cashier' or name contains '.db' or name contains 'backup') and trashed=false";
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        q
      )}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=25`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.error('Error listing Drive backups:', err);
    return [];
  }
}

/**
 * Downloads a backup file from Google Drive by file ID as ArrayBuffer
 */
export async function downloadBackupFromGoogleDrive(fileId: string): Promise<ArrayBuffer> {
  const token = cachedAccessToken;
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('تعذر تحميل ملف النسخة الاحتياطية من Google Drive');
  }

  return await res.arrayBuffer();
}

/**
 * Deletes a backup file from Google Drive (Mandatory confirmation handled by caller UI)
 */
export async function deleteBackupFromGoogleDrive(fileId: string): Promise<void> {
  const token = cachedAccessToken;
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب Google');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error('تعذر حذف الملف من Google Drive');
  }
}

// ==========================================
// Cloud Firestore Backup Integration
// ==========================================

export interface FirestoreBackupItem {
  id: string;
  fileName: string;
  createdAt: string;
  totalProducts?: number;
  totalInvoices?: number;
}

/**
 * Saves a backup snapshot to Cloud Firestore under user's private collection
 */
export async function saveBackupToFirestore(
  userId: string,
  dataJson: string,
  summary?: { productsCount?: number; invoicesCount?: number; customName?: string }
): Promise<string> {
  const backupId = `backup_${Date.now()}`;
  const dateStr = new Date().toISOString();
  const docRef = doc(firestore, 'users', userId, 'backups', backupId);
  const fileName = summary?.customName || generateBackupFileName('autoSave');

  await setDoc(docRef, {
    id: backupId,
    userId,
    fileName,
    createdAt: dateStr,
    dataJson,
    totalProducts: summary?.productsCount || 0,
    totalInvoices: summary?.invoicesCount || 0,
  });

  return backupId;
}

/**
 * Lists backups saved in Cloud Firestore
 */
export async function listFirestoreBackups(userId: string): Promise<FirestoreBackupItem[]> {
  try {
    const q = query(
      collection(firestore, 'users', userId, 'backups'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const items: FirestoreBackupItem[] = [];
    snap.forEach((d) => {
      const data = d.data();
      items.push({
        id: d.id,
        fileName: data.fileName || d.id,
        createdAt: data.createdAt || '',
        totalProducts: data.totalProducts,
        totalInvoices: data.totalInvoices,
      });
    });
    return items;
  } catch (err) {
    console.error('Error fetching Firestore backups:', err);
    return [];
  }
}

/**
 * Loads a backup JSON string from Firestore
 */
export async function loadBackupFromFirestore(userId: string, backupId: string): Promise<string> {
  const docRef = doc(firestore, 'users', userId, 'backups', backupId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('ملف النسخة الاحتياطية غير موجود في Firestore');
  }
  return snap.data()?.dataJson || '';
}

/**
 * Deletes a backup from Cloud Firestore
 */
export async function deleteBackupFromFirestore(userId: string, backupId: string): Promise<void> {
  const docRef = doc(firestore, 'users', userId, 'backups', backupId);
  await deleteDoc(docRef);
}
