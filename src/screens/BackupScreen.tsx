import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  RotateCcw,
  Check,
  AlertTriangle,
  Cloud,
  CheckCircle2,
  Type,
  Sun,
  Moon,
  Coins,
  Store,
  Minus,
  Plus,
  Link2,
  Unlink,
  RefreshCw,
  LogOut,
  Mail,
  Edit2,
  ShieldCheck,
  Trash2,
  HardDrive,
  Database,
  ExternalLink,
  UploadCloud,
  FolderArchive,
  FolderOpen,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DB } from '../services/db';
import { StoreSettings } from '../types';
import { playSuccessChime } from '../services/audio';
import {
  initAuth,
  signInWithGoogle,
  signOutGoogle,
  uploadBackupToGoogleDrive,
  listGoogleDriveBackups,
  downloadBackupFromGoogleDrive,
  deleteBackupFromGoogleDrive,
  saveBackupToFirestore,
  listFirestoreBackups,
  loadBackupFromFirestore,
  deleteBackupFromFirestore,
  type DriveFileItem,
  type FirestoreBackupItem,
} from '../services/firebase';
import {
  createSqliteDbBlob,
  universalRestore,
  generateBackupFileName,
} from '../services/dbFormat';
import type { StorageBackupRecord } from '../services/storage/types';
import type { User } from 'firebase/auth';

const ARABIC_FONTS = [
  { id: 'Cairo', name: 'خط كايرو (Cairo)', desc: 'عصري وواضح جداً للكاشير' },
  { id: 'Tajawal', name: 'خط تجول (Tajawal)', desc: 'أنيق وناعم ومريح للعين' },
  { id: 'Almarai', name: 'خط المراعي (Almarai)', desc: 'رسمي وممتاز لقراءة الفواتير' },
  { id: 'Readex Pro', name: 'خط ريدكس برو (Readex Pro)', desc: 'هندسي حديث وواضح للأرقام' },
  { id: 'Changa', name: 'خط تشانغا (Changa)', desc: 'عريض وبارز للعناوين والأسعار' },
  { id: 'IBM Plex Sans Arabic', name: 'خط آي بي إم (IBM Plex)', desc: 'تقني ودقيق للجداول المحاسبية' },
  { id: 'Noto Kufi Arabic', name: 'خط نوتو كوفي (Noto Kufi)', desc: 'خط كوفي عربي أصيل ومتناسق' },
  { id: 'Amiri', name: 'خط أميري (Amiri)', desc: 'خط عربي كلاسيكي فاخر' },
];

const CURRENCY_PRESETS = [
  { label: 'دينار عراقي (د.ع)', value: 'د.ع' },
  { label: 'دينار عراقي (كتابة كاملة)', value: 'دينار عراقي' },
  { label: 'دولار أمريكي ($)', value: '$' },
  { label: 'دولار (كتابة كاملة)', value: 'دولار' },
];

export const BackupScreen: React.FC = () => {
  const [settings, setSettings] = useState<StoreSettings>(DB.getSettings());
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [driveBackups, setDriveBackups] = useState<DriveFileItem[]>([]);
  const [firestoreBackups, setFirestoreBackups] = useState<FirestoreBackupItem[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [activeCloudTab, setActiveCloudTab] = useState<'drive' | 'firestore'>('drive');
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Phase 7A: Dexie Historical Backups & Local State
  const [historicalBackups, setHistoricalBackups] = useState<StorageBackupRecord[]>([]);
  const [dexieBackupLoading, setDexieBackupLoading] = useState(false);
  const dexieFileInputRef = useRef<HTMLInputElement>(null);

  const toggleSection = (id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText: string;
    isDanger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const loadCloudBackups = async (user: User) => {
    setCloudLoading(true);
    try {
      const [driveList, firestoreList] = await Promise.all([
        listGoogleDriveBackups(),
        listFirestoreBackups(user.uid),
      ]);
      setDriveBackups(driveList);
      setFirestoreBackups(firestoreList);
    } catch (err) {
      console.error('Error loading cloud backups:', err);
    } finally {
      setCloudLoading(false);
    }
  };

  useEffect(() => {
    const unsubAuth = initAuth(
      (user) => {
        setCurrentUser(user);
        if (user) {
          DB.saveSettings({ googleDriveLinked: true, userEmail: user.email || '' }).catch(console.error);
          loadCloudBackups(user);
        } else {
          setDriveBackups([]);
          setFirestoreBackups([]);
        }
      },
      () => {
        setCurrentUser(null);
        setDriveBackups([]);
        setFirestoreBackups([]);
      }
    );

    const unsubDB = DB.subscribe(() => {
      setSettings(DB.getSettings());
    });

    return () => {
      unsubAuth();
      unsubDB();
    };
  }, []);

  const loadHistoricalBackups = async () => {
    try {
      const list = await DB.listHistoricalBackups();
      setHistoricalBackups(list);
    } catch (err) {
      console.warn('Failed to load historical backups:', err);
    }
  };

  useEffect(() => {
    loadHistoricalBackups();
    DB.checkAndRunDailyAutoBackup()
      .then((autoRec) => {
        if (autoRec) {
          loadHistoricalBackups();
        }
      })
      .catch((e) => console.warn('Auto backup check:', e));
  }, []);

  const handleCreateDexieBackup = async (type: 'manual' | 'daily_auto' = 'manual') => {
    setDexieBackupLoading(true);
    try {
      const res = await DB.createFullBackup(type);
      playSuccessChime();

      // Trigger file download
      const url = URL.createObjectURL(res.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`تم إنشاء النسخة الاحتياطية بنجاح (${res.fileName}) - البصمة: ${res.backupRecord.checksum.substring(0, 10)}...`);
      await loadHistoricalBackups();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'حدث خطأ أثناء إنشاء النسخة الاحتياطية', 'error');
    } finally {
      setDexieBackupLoading(false);
    }
  };

  const handleDexieFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDexieBackupLoading(true);
    try {
      const text = await file.text();
      // Sandbox validation gate
      const validation = await DB.validateBackupInSandbox(text);
      if (!validation.valid || !validation.manifest) {
        showToast(validation.error || 'الملف غير صالح أو تالف', 'error');
        return;
      }

      const m = validation.manifest;
      setConfirmModal({
        title: 'تأكيد استرجاع نسخة Dexie الاحتياطية',
        message: `تم التحقق بنجاح من سلامة الملف في البيئة المعزولة (Sandbox).
المتجر: ${m.storeName}
تاريخ النسخة: ${new Date(m.createdAt).toLocaleString('ar-SA')}
إجمالي السجلات: ${m.totalRecords}
بصمة التحقق: ${m.checksum.substring(0, 12)}...

تنبيه: سيتم أخذ نسخة أمان تلقائية للبيانات الحالية قبل الاسترجاع. هل توافق على استبدال البيانات الحالية؟`,
        confirmText: 'نعم، استرجع البيانات الآن',
        isDanger: true,
        onConfirm: async () => {
          setDexieBackupLoading(true);
          try {
            const res = await DB.restoreDexieBackupSafely(text);
            playSuccessChime();
            setSettings(DB.getSettings());
            showToast(res.message);
            await loadHistoricalBackups();
          } catch (err: any) {
            showToast(err.message || 'فشلت عملية الاسترجاع', 'error');
          } finally {
            setDexieBackupLoading(false);
            setConfirmModal(null);
          }
        },
      });
    } catch (err: any) {
      showToast(err.message || 'تعذر قراءة ملف النسخة الاحتياطية', 'error');
    } finally {
      setDexieBackupLoading(false);
      if (dexieFileInputRef.current) dexieFileInputRef.current.value = '';
    }
  };

  const handleRestoreHistorical = (item: StorageBackupRecord) => {
    setConfirmModal({
      title: 'استرجاع نسخة تاريخية محفوظة',
      message: `هل أنت متأكد من استرجاع النسخة "${item.label}" (${item.fileName})؟
تاريخ الحفظ: ${new Date(item.createdAt).toLocaleString('ar-SA')}
إجمالي السجلات: ${item.totalRecords}
البصمة: ${item.checksum.substring(0, 12)}...

سيتم أخذ نسخة أمان تلقائية للبيانات الحالية قبل التطبيق.`,
      confirmText: 'استرجاع النسخة',
      isDanger: true,
      onConfirm: async () => {
        setDexieBackupLoading(true);
        try {
          const res = await DB.restoreDexieBackupSafely(item.payloadJson);
          playSuccessChime();
          setSettings(DB.getSettings());
          showToast(res.message);
          await loadHistoricalBackups();
        } catch (err: any) {
          showToast(err.message || 'فشلت عملية الاسترجاع', 'error');
        } finally {
          setDexieBackupLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const handleDeleteHistorical = (id: string, fileName: string) => {
    setConfirmModal({
      title: 'حذف نسخة تاريخية',
      message: `هل تريد حذف النسخة الاحتياطية المحفوظة محلياً (${fileName})؟`,
      confirmText: 'حذف',
      isDanger: true,
      onConfirm: async () => {
        try {
          await DB.deleteHistoricalBackup(id);
          showToast('تم حذف النسخة بنجاح');
          await loadHistoricalBackups();
        } catch (err) {
          showToast('فشل حذف النسخة', 'error');
        } finally {
          setConfirmModal(null);
        }
      },
    });
  };

  const handleDownloadHistorical = (item: StorageBackupRecord) => {
    const blob = new Blob([item.payloadJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`تم تنزيل النسخة (${item.fileName})`);
  };

  const updateSettingImmediate = async (partial: Partial<StoreSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    try {
      await DB.saveSettings(partial);
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  };

  const handleSaveStoreForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await DB.saveSettings(settings);
      playSuccessChime();
      showToast('تم حفظ إعدادات المحل والعملة والمظهر بنجاح');
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast('حدث خطأ أثناء حفظ الإعدادات', 'error');
    }
  };

  const handleExportBackup = async (format: 'db' | 'json' = 'db', chooseLocationManually: boolean = false) => {
    setCloudLoading(true);
    try {
      const { blob, fileName } =
        format === 'db'
          ? await createSqliteDbBlob()
          : {
              blob: new Blob([DB.backupData()], { type: 'application/json' }),
              fileName: generateBackupFileName('autoSave').replace('.db', '.json'),
            };

      // If user requested manual location selection and browser supports File System Access API
      if (chooseLocationManually && 'showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [
              format === 'db'
                ? {
                    description: 'قاعدة بيانات SQLite للكاشير (*.db)',
                    accept: { 'application/x-sqlite3': ['.db'] },
                  }
                : {
                    description: 'ملف JSON للنسخ الاحتياطي (*.json)',
                    accept: { 'application/json': ['.json'] },
                  },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          playSuccessChime();
          showToast(`تم حفظ النسخة بنجاح في المكان المحدد يدوياً: ${handle.name || fileName}`);
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') {
            // User cancelled file picker intentionally
            return;
          }
          console.warn('showSaveFilePicker error, falling back to download:', err);
        }
      }

      // Standard browser download (or fallback)
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      playSuccessChime();
      const dest = settings.backupCustomFolder || 'Download/Cashier/backup';
      showToast(`تم حفظ النسخة (${fileName}) - مسار المجلد: ${dest}`);
    } catch (err: any) {
      console.error(err);
      showToast('حدث خطأ أثناء تصدير ملف قاعدة البيانات', 'error');
    } finally {
      setCloudLoading(false);
    }
  };

  const handleChooseDirectoryManually = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        const fullPath = `Download/Cashier/${dirHandle.name}`;
        updateSettingImmediate({ backupCustomFolder: fullPath });
        playSuccessChime();
        showToast(`تم تعيين مجلد النسخ الاحتياطي يدوياً إلى: ${dirHandle.name}`);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          showToast('تعذر اختيار المجلد من الجهاز', 'error');
        }
      }
    } else {
      showToast('يرجى كتابة اسم أو مسار المجلد يدوياً في الحقل أدناه', 'error');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCloudLoading(true);
    try {
      const res = await universalRestore(file);
      if (res.success) {
        playSuccessChime();
        setSettings(DB.getSettings());
        showToast(res.message);
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'تعذر استرجاع ملف قاعدة البيانات', 'error');
    } finally {
      setCloudLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Google Sign-In with Google Drive scopes
  const handleGoogleSignIn = async () => {
    setCloudLoading(true);
    try {
      const res = await signInWithGoogle();
      if (res?.user) {
        setCurrentUser(res.user);
        await DB.saveSettings({ googleDriveLinked: true, userEmail: res.user.email || '' });
        setSettings(DB.getSettings());
        playSuccessChime();
        showToast(`مرحباً ${res.user.displayName || ''}، تم تسجيل الدخول بحساب Google بنجاح`);
        await loadCloudBackups(res.user);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'حدث خطأ أثناء تسجيل الدخول بحساب Google', 'error');
    } finally {
      setCloudLoading(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOutGoogle();
      await DB.clearGoogleAccount();
      setCurrentUser(null);
      setDriveBackups([]);
      setFirestoreBackups([]);
      setSettings(DB.getSettings());
      playSuccessChime();
      showToast('تم تسجيل الخروج وإلغاء ربط الحساب بنجاح');
    } catch (err) {
      showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
    }
  };

  // Google Drive Upload
  const handleBackupToGoogleDrive = async () => {
    if (!currentUser) {
      showToast('يرجى تسجيل الدخول بحساب Google أولاً', 'error');
      return;
    }
    setCloudLoading(true);
    try {
      const { binary, fileName } = await createSqliteDbBlob();
      await uploadBackupToGoogleDrive(binary, fileName);
      playSuccessChime();
      showToast(`تم رفع النسخة الاحتياطية (${fileName}) إلى Google Drive بنجاح`);
      const updatedList = await listGoogleDriveBackups();
      setDriveBackups(updatedList);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'فشل حفظ النسخة في Google Drive', 'error');
    } finally {
      setCloudLoading(false);
    }
  };

  // Google Drive Restore with Confirmation Dialog
  const handleRestoreFromGoogleDrive = (file: DriveFileItem) => {
    setConfirmModal({
      title: 'استرجاع النسخة الاحتياطية من Google Drive',
      message: `هل أنت متأكد من استرجاع الملف "${file.name}"؟ سيتم استبدال البيانات الحالية بمحتوى النسخة الاحتياطية المحددة.`,
      confirmText: 'نعم، استرجع البيانات',
      isDanger: false,
      onConfirm: async () => {
        setCloudLoading(true);
        try {
          const buffer = await downloadBackupFromGoogleDrive(file.id);
          const res = await universalRestore(buffer);
          if (res.success) {
            playSuccessChime();
            setSettings(DB.getSettings());
            showToast(res.message);
          } else {
            showToast(res.message, 'error');
          }
        } catch (err: any) {
          showToast(err.message || 'تعذر تحميل النسخة من Google Drive', 'error');
        } finally {
          setCloudLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  // Google Drive Delete with Confirmation Dialog
  const handleDeleteDriveBackup = (file: DriveFileItem) => {
    setConfirmModal({
      title: 'حذف ملف النسخة الاحتياطية من Google Drive',
      message: `هل أنت متأكد من رغبتك في حذف الملف "${file.name}" من Google Drive نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف الملف نهائياً',
      isDanger: true,
      onConfirm: async () => {
        setCloudLoading(true);
        try {
          await deleteBackupFromGoogleDrive(file.id);
          playSuccessChime();
          showToast('تم حذف ملف النسخة من Google Drive');
          const updated = await listGoogleDriveBackups();
          setDriveBackups(updated);
        } catch (err: any) {
          showToast(err.message || 'تعذر حذف الملف من Google Drive', 'error');
        } finally {
          setCloudLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  // Cloud Firestore Upload
  const handleBackupToFirestore = async () => {
    if (!currentUser) return;
    setCloudLoading(true);
    try {
      const dataStr = DB.backupData();
      const products = DB.getProducts();
      const invoices = DB.getInvoices();
      await saveBackupToFirestore(currentUser.uid, dataStr, {
        productsCount: products.length,
        invoicesCount: invoices.length,
      });
      playSuccessChime();
      showToast('تم حفظ اللقطة السحابية في Firebase Firestore بنجاح');
      const updated = await listFirestoreBackups(currentUser.uid);
      setFirestoreBackups(updated);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'فشل حفظ النسخة في Firestore', 'error');
    } finally {
      setCloudLoading(false);
    }
  };

  // Cloud Firestore Restore
  const handleRestoreFromFirestore = (backup: FirestoreBackupItem) => {
    if (!currentUser) return;
    setConfirmModal({
      title: 'استرجاع النسخة السحابية من Firebase Firestore',
      message: `هل أنت متأكد من استرجاع النسخة "${backup.fileName}"؟ سيتم تحديث قاعدة بيانات المحل بالكامل.`,
      confirmText: 'استرجاع الآن',
      isDanger: false,
      onConfirm: async () => {
        setCloudLoading(true);
        try {
          const jsonStr = await loadBackupFromFirestore(currentUser.uid, backup.id);
          const res = await universalRestore(jsonStr);
          if (res.success) {
            playSuccessChime();
            setSettings(DB.getSettings());
            showToast(res.message);
          } else {
            showToast(res.message, 'error');
          }
        } catch (err: any) {
          showToast(err.message || 'تعذر استرجاع النسخة من Firestore', 'error');
        } finally {
          setCloudLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  // Cloud Firestore Delete
  const handleDeleteFirestoreBackup = (backup: FirestoreBackupItem) => {
    if (!currentUser) return;
    setConfirmModal({
      title: 'حذف النسخة من Firebase Firestore',
      message: `هل تريد حذف النسخة "${backup.fileName}" من قاعدة بيانات Firestore؟`,
      confirmText: 'حذف النسخة',
      isDanger: true,
      onConfirm: async () => {
        setCloudLoading(true);
        try {
          await deleteBackupFromFirestore(currentUser.uid, backup.id);
          playSuccessChime();
          showToast('تم حذف النسخة من Firestore');
          const updated = await listFirestoreBackups(currentUser.uid);
          setFirestoreBackups(updated);
        } catch (err: any) {
          showToast(err.message || 'تعذر حذف النسخة من Firestore', 'error');
        } finally {
          setCloudLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const currentFontSize = settings.fontSize || 16;
  const currentProductsFontSize = settings.productsFontSize || 15;
  const currentFont = settings.fontFamily || 'Cairo';
  const isDark = settings.theme === 'dark';

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-2">
      {/* Status notification */}
      {statusMessage && (
        <div
          className={`sticky top-16 z-30 p-3.5 rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-2 shadow-md ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Settings Top Header Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-900 text-base sm:text-lg">إعدادات النظام والنسخ الاحتياطي</h2>
          <p className="text-xs text-slate-500 mt-0.5">انقر على الخيار الذي تريد تعديله لفتح تفرعاته</p>
        </div>
        {openSection && (
          <button
            type="button"
            onClick={() => setOpenSection(null)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            إغلاق التفرعات
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* 1. النمط الليلي والنهاري (Theme Mode) */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('theme')}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right cursor-pointer transition ${
              openSection === 'theme' ? 'bg-slate-50/80 border-b border-slate-200/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-3.5 overflow-hidden">
              <div className="h-11 w-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                {isDark ? <Moon className="h-5 w-5 text-indigo-500" /> : <Sun className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">النمط الليلي والنهاري</h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">مظهر الواجهة المريح للعين أثناء العمل</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-xl hidden sm:inline-block ${
                isDark ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {isDark ? 'النمط الليلي (داكن)' : 'النمط النهاري (فاتح)'}
              </span>
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                {openSection === 'theme' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>

          {openSection === 'theme' && (
            <div className="p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateSettingImmediate({ theme: 'light' })}
                  className={`flex items-center justify-center gap-2.5 p-3.5 rounded-2xl border-2 font-bold text-sm transition cursor-pointer ${
                    !isDark
                      ? 'border-teal-600 bg-teal-50/70 text-teal-800 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Sun className="h-5 w-5 text-amber-500" />
                  <span>النمط النهاري (فاتح)</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateSettingImmediate({ theme: 'dark' })}
                  className={`flex items-center justify-center gap-2.5 p-3.5 rounded-2xl border-2 font-bold text-sm transition cursor-pointer ${
                    isDark
                      ? 'border-teal-500 bg-teal-950/50 text-teal-300 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Moon className="h-5 w-5 text-indigo-400" />
                  <span>النمط الليلي (داكن)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. نوع العملة وسعر الصرف */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('currency')}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right cursor-pointer transition ${
              openSection === 'currency' ? 'bg-slate-50/80 border-b border-slate-200/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-3.5 overflow-hidden">
              <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">نوع العملة وسعر الصرف</h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">تحديد العملة المستخدمة في الفواتير والأسعار</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hidden sm:inline-block">
                {settings.currency || 'د.ع'}
              </span>
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                {openSection === 'currency' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>

          {openSection === 'currency' && (
            <div className="p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CURRENCY_PRESETS.map((preset) => {
                  const active = settings.currency === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => updateSettingImmediate({ currency: preset.value })}
                      className={`p-2.5 rounded-2xl border text-xs font-extrabold transition cursor-pointer ${
                        active
                          ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كتابة نوع العملة يدويًا (يظهر في كل الفواتير):
                  </label>
                  <input
                    type="text"
                    value={settings.currency}
                    onChange={(e) => updateSettingImmediate({ currency: e.target.value })}
                    placeholder="مثال: د.ع أو دينار عراقي أو $ أو دولار"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold focus:border-teal-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سعر صرف 1 دولار بالدينار العراقي (اختياري):
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={settings.exchangeRate || 1500}
                    onChange={(e) => updateSettingImmediate({ exchangeRate: parseFloat(e.target.value) || 1500 })}
                    placeholder="1500"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold focus:border-teal-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. الخطوط العربية وحجم النصوص */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('fonts')}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right cursor-pointer transition ${
              openSection === 'fonts' ? 'bg-slate-50/80 border-b border-slate-200/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-3.5 overflow-hidden">
              <div className="h-11 w-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Type className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">الخطوط العربية وحجم النصوص</h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">تخصيص خط البرنامج وحجم خط أسماء المنتجات</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hidden sm:inline-block">
                {currentFont} • {currentFontSize}px
              </span>
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                {openSection === 'fonts' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>

          {openSection === 'fonts' && (
            <div className="p-4 sm:p-5 space-y-5 animate-in fade-in duration-200">
              {/* General Program Font Size */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-800 block">
                      1. حجم خط البرنامج العام (القوائم، العناوين، والأزرار):
                    </span>
                    <span className="text-[11px] text-slate-500">يؤثر على واجهة البرنامج العامة</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-lg bg-teal-600 text-white font-mono text-xs font-bold">
                    {currentFontSize}px
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'صغير', size: 14 },
                    { label: 'متوسط', size: 16 },
                    { label: 'كبير', size: 18 },
                    { label: 'كبير جداً', size: 20 },
                  ].map((item) => (
                    <button
                      key={item.size}
                      type="button"
                      onClick={() => updateSettingImmediate({ fontSize: item.size })}
                      className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        currentFontSize === item.size
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label} ({item.size})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => updateSettingImmediate({ fontSize: Math.max(12, currentFontSize - 1) })}
                    className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title="تصغير خط البرنامج"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="range"
                    min={12}
                    max={22}
                    step={1}
                    value={currentFontSize}
                    onChange={(e) => updateSettingImmediate({ fontSize: Number(e.target.value) })}
                    className="flex-1 accent-teal-600 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => updateSettingImmediate({ fontSize: Math.min(22, currentFontSize + 1) })}
                    className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title="تكبير خط البرنامج"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Products Font Size */}
              <div className="space-y-3 bg-teal-50/40 p-4 rounded-2xl border border-teal-200/80">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-800 block">
                      2. حجم خط المنتجات (في المخزن وقوائم الفواتير):
                    </span>
                    <span className="text-[11px] text-slate-500">
                      خاص بأسماء المنتجات والكميات والأسعار فقط
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-600 text-white font-mono text-xs font-bold">
                    {currentProductsFontSize}px
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'صغير', size: 12 },
                    { label: 'متوسط', size: 15 },
                    { label: 'كبير', size: 18 },
                    { label: 'كبير جداً', size: 22 },
                  ].map((item) => (
                    <button
                      key={item.size}
                      type="button"
                      onClick={() => updateSettingImmediate({ productsFontSize: item.size })}
                      className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        currentProductsFontSize === item.size
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label} ({item.size})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateSettingImmediate({ productsFontSize: Math.max(11, currentProductsFontSize - 1) })
                    }
                    className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title="تصغير خط المنتجات"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="range"
                    min={11}
                    max={26}
                    step={1}
                    value={currentProductsFontSize}
                    onChange={(e) => updateSettingImmediate({ productsFontSize: Number(e.target.value) })}
                    className="flex-1 accent-amber-600 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateSettingImmediate({ productsFontSize: Math.min(26, currentProductsFontSize + 1) })
                    }
                    className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title="تكبير خط المنتجات"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 rounded-xl bg-white p-3 border border-slate-200 flex items-center justify-between">
                  <span
                    style={{ fontSize: `${currentProductsFontSize}px` }}
                    className="font-bold text-slate-900"
                  >
                    معاينة: Lcd iph 11 pro max
                  </span>
                  <span
                    style={{ fontSize: `${currentProductsFontSize}px` }}
                    className="font-mono font-bold text-teal-700"
                  >
                    15,000 {settings.currency}
                  </span>
                </div>
              </div>

              {/* Best Arabic Fonts */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  اختر من أفضل الخطوط العربية:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ARABIC_FONTS.map((font) => {
                    const selected = currentFont === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => updateSettingImmediate({ fontFamily: font.id })}
                        style={{ fontFamily: `'${font.id}', sans-serif` }}
                        className={`p-3.5 rounded-2xl border text-right transition flex items-center justify-between cursor-pointer ${
                          selected
                            ? 'border-teal-600 bg-teal-50/70 text-teal-900 ring-2 ring-teal-500/20'
                            : 'border-slate-200 bg-slate-50/60 text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-sm">{font.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{font.desc}</div>
                          <div className="text-xs font-bold text-teal-700 mt-1">
                            15,000 {settings.currency} • فاتورة مبيعات
                          </div>
                        </div>
                        {selected && (
                          <div className="h-6 w-6 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. بيانات المحل وإيصال الطباعة */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('store')}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right cursor-pointer transition ${
              openSection === 'store' ? 'bg-slate-50/80 border-b border-slate-200/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-3.5 overflow-hidden">
              <div className="h-11 w-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">بيانات المحل وإيصال الطباعة</h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">اسم المحل ورقم الهاتف والعنوان وترويسة الفاتورة</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 max-w-[120px] truncate hidden sm:inline-block">
                {settings.storeName || 'Cashier'}
              </span>
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                {openSection === 'store' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>

          {openSection === 'store' && (
            <div className="p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
              <form onSubmit={handleSaveStoreForm} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">اسم المحل / الشركة</label>
                    <input
                      type="text"
                      value={settings.storeName}
                      onChange={(e) => updateSettingImmediate({ storeName: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                    <input
                      type="text"
                      value={settings.phone}
                      onChange={(e) => updateSettingImmediate({ phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-hidden"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
                    <input
                      type="text"
                      value={settings.address}
                      onChange={(e) => updateSettingImmediate({ address: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">عبارة أسفل الفاتورة</label>
                    <input
                      type="text"
                      value={settings.receiptFooter}
                      onChange={(e) => updateSettingImmediate({ receiptFooter: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> يتم حفظ جميع التغييرات والإعدادات تلقائياً
                  </span>
                  <button
                    type="submit"
                    className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white hover:bg-teal-700 shadow-xs transition cursor-pointer"
                  >
                    تأكيد الحفظ
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* 5. النسخ الاحتياطي وقاعدة البيانات (.db) */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('backup')}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right cursor-pointer transition ${
              openSection === 'backup' ? 'bg-slate-50/80 border-b border-slate-200/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-3.5 overflow-hidden">
              <div className="h-11 w-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">النسخ الاحتياطي وقاعدة البيانات (.db)</h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">حفظ واسترجاع قاعدة البيانات بصيغة data (autoSave)... .db</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 hidden sm:inline-block" dir="ltr">
                *.db / autoSave
              </span>
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                {openSection === 'backup' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>

          {openSection === 'backup' && (
            <div className="p-4 sm:p-5 space-y-5 animate-in fade-in duration-200">
              {/* Active Engine Badge */}
              <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-emerald-950">محرك التشغيل النشط المعتمد</span>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                        Dexie IndexedDB (Single Source of Truth)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      قاعدة بيانات سريعة ومحلية تدعم جميع الجداول والصور وسجل التغييرات الكامل دون انقطاع
                    </p>
                  </div>
                </div>
              </div>

              {/* Last Backup Status Banner */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-2 text-right">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Database className="h-4 w-4 text-teal-600" />
                    حالة آخر نسخة احتياطية
                  </span>
                  {historicalBackups.length > 0 ? (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      مؤمنة بالبصمة الرقمية
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      لا توجد نسخ محفوظة بعد
                    </span>
                  )}
                </div>

                {historicalBackups.length > 0 ? (
                  <div className="bg-white rounded-xl p-3 border border-slate-200/90 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-slate-700 font-medium">
                      <span>تاريخ النسخة الأخيرة:</span>
                      <span className="font-bold font-mono text-slate-900" dir="ltr">
                        {new Date(historicalBackups[0].createdAt).toLocaleString('ar-SA')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 font-medium">
                      <span>نوع النسخة والملف:</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          historicalBackups[0].type === 'daily_auto'
                            ? 'bg-blue-100 text-blue-800'
                            : historicalBackups[0].type === 'pre_restore_safety'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {historicalBackups[0].type === 'daily_auto'
                            ? 'يومية تلقائية'
                            : historicalBackups[0].type === 'pre_restore_safety'
                            ? 'أمان قبل الاسترجاع'
                            : 'يدوية'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-600 truncate max-w-[180px]" dir="ltr">
                          {historicalBackups[0].fileName}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 font-medium">
                      <span>إجمالي السجلات والحجم:</span>
                      <span className="font-bold text-teal-700 font-mono">
                        {historicalBackups[0].totalRecords} سجل • {(historicalBackups[0].sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>بصمة التحقق (SHA-256):</span>
                      <span className="font-mono font-bold text-slate-700 select-all" dir="ltr">
                        {historicalBackups[0].checksum.substring(0, 16)}...
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    يُنصح بإنشاء أول نسخة احتياطية كاملة الآن لحفظ بياناتك في السجل التاريخي وتنزيلها على جهازك.
                  </p>
                )}
              </div>

              {/* Primary Actions for Dexie Full Backup */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleCreateDexieBackup('manual')}
                  disabled={dexieBackupLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl bg-teal-600 hover:bg-teal-700 py-3.5 px-4 text-base font-bold text-white shadow-md transition active:scale-98 disabled:opacity-60 cursor-pointer"
                >
                  {dexieBackupLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Download className="h-5 w-5" />
                  )}
                  <div className="text-center">
                    <div>إنشاء نسخة احتياطية كاملة لقاعدة Dexie (تنزيل وحفظ تاريخي)</div>
                    <div className="text-[11px] text-teal-100 font-normal">
                      تشمل جميع الجداول الـ 12، صور المنتجات، والعلاقات، وسجل التغييرات الكامل
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => dexieFileInputRef.current?.click()}
                  disabled={dexieBackupLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl bg-slate-800 hover:bg-slate-900 py-3.5 px-4 text-base font-bold text-white shadow-md transition active:scale-98 disabled:opacity-60 cursor-pointer"
                >
                  <RotateCcw className="h-5 w-5 text-teal-400" />
                  <div className="text-center">
                    <div>استرجاع نسخة احتياطية من ملف (مع الفحص في Sandbox)</div>
                    <div className="text-[11px] text-slate-300 font-normal">
                      يتم اختبار سلامة الملف والبصمة في قاعدة تجريبية معزولة قبل أي استبدال
                    </div>
                  </div>
                </button>

                <input
                  ref={dexieFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleDexieFileChange}
                  className="hidden"
                />
              </div>

              {/* Historical Backups List */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200/90 overflow-hidden">
                <div className="p-3.5 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderArchive className="h-4 w-4 text-teal-700" />
                    <span className="text-xs font-black text-slate-900">
                      سجل النسخ الاحتياطية التاريخية المحفوظة ({historicalBackups.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">الاحتفاظ بآخر 10 نسخ تلقائياً</span>
                </div>

                {historicalBackups.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                    <FolderArchive className="h-8 w-8 mx-auto text-slate-300 stroke-1" />
                    <p>لا توجد نسخ تاريخية محفوظة محلياً حتى الآن</p>
                    <p className="text-[11px] text-slate-400">
                      عند إنشاء نسخة أو أخذ نسخة يومية تلقائياً، ستظهر هنا للإدارة والاسترجاع السريع
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200/70 max-h-80 overflow-y-auto">
                    {historicalBackups.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex items-center justify-between gap-2 hover:bg-white transition"
                      >
                        <div className="overflow-hidden space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs font-mono truncate max-w-[220px]" dir="ltr">
                              {item.fileName}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm shrink-0 ${
                              item.type === 'daily_auto'
                                ? 'bg-blue-100 text-blue-800'
                                : item.type === 'pre_restore_safety'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {item.type === 'daily_auto'
                                ? 'يومية تلقائية'
                                : item.type === 'pre_restore_safety'
                                ? 'نسخة أمان'
                                : 'يدوية'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>{new Date(item.createdAt).toLocaleString('ar-SA')}</span>
                            <span>•</span>
                            <span className="font-bold text-teal-700">{item.totalRecords} سجل</span>
                            <span>•</span>
                            <span>{(item.sizeBytes / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadHistorical(item)}
                            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            title="تنزيل الملف على الجهاز"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreHistorical(item)}
                            disabled={dexieBackupLoading}
                            className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            title="استرجاع آمن لهذه النسخة"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>استرجاع</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHistorical(item.id, item.fileName)}
                            className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="حذف من السجل"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Legacy SQLite .db Export / Import Section for Backwards Compatibility */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <HardDrive className="h-4 w-4 text-slate-500" />
                    التوافق مع ملفات SQLite السابقة (.db)
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md" dir="ltr">
                    data (autoSave)*.db
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  إذا كان لديك ملفات سابقة بصيغة SQLite أو تريد تصدير ملف متوافق مع البرامج الخارجية:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportBackup('db', false)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 px-3 text-xs font-bold transition cursor-pointer border border-slate-200"
                  >
                    <Database className="h-4 w-4 text-teal-700" />
                    <span>تصدير ملف SQLite (.db)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 px-3 text-xs font-bold transition cursor-pointer border border-slate-200"
                  >
                    <RotateCcw className="h-4 w-4 text-teal-700" />
                    <span>استيراد ملف SQLite (.db)</span>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3,application/x-sqlite3,application/octet-stream,*/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </div>

        {/* 6. المزامنة السحابية (Google Drive & Firebase) */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('cloud')}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right cursor-pointer transition ${
              openSection === 'cloud' ? 'bg-slate-50/80 border-b border-slate-200/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-3.5 overflow-hidden">
              <div className="h-11 w-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">Google Drive & Firebase السحابي</h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">حفظ واسترجاع النسخ السحابية عبر حساب Google</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentUser ? (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  متصل
                </span>
              ) : (
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                  غير متصل
                </span>
              )}
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                {openSection === 'cloud' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>

          {openSection === 'cloud' && (
            <div className="p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
              {currentUser ? (
                /* Signed In User View */
                <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  {/* Account Card Header */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      {currentUser.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          alt={currentUser.displayName || ''}
                          className="h-10 w-10 rounded-full border border-slate-300 object-cover shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-500 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                          {currentUser.displayName ? currentUser.displayName[0] : 'G'}
                        </div>
                      )}
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm truncate">
                            {currentUser.displayName || 'مستخدم Google'}
                          </h4>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-sm">
                            Google Drive نشط
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 font-mono block truncate" dir="ltr">
                          {currentUser.email}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignOut}
                      className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 text-xs font-bold transition shrink-0 cursor-pointer"
                      title="تسجيل الخروج"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>خروج</span>
                    </button>
                  </div>

                  {/* Service Tab Switcher (Google Drive vs Firebase Firestore) */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setActiveCloudTab('drive')}
                      className={`py-2 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
                        activeCloudTab === 'drive'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <HardDrive className="h-4 w-4 text-amber-500" />
                      <span>Google Drive ({driveBackups.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCloudTab('firestore')}
                      className={`py-2 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
                        activeCloudTab === 'firestore'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Database className="h-4 w-4 text-orange-500" />
                      <span>Firebase Firestore ({firestoreBackups.length})</span>
                    </button>
                  </div>

                  {/* TAB 1: Google Drive Backups */}
                  {activeCloudTab === 'drive' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleBackupToGoogleDrive}
                          disabled={cloudLoading}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-98 disabled:opacity-60 cursor-pointer"
                        >
                          {cloudLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UploadCloud className="h-4 w-4" />
                          )}
                          <span>رفع نسخة احتياطية جديدة إلى Google Drive</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => currentUser && loadCloudBackups(currentUser)}
                          disabled={cloudLoading}
                          className="p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                          title="تحديث قائمة الملفات"
                        >
                          <RefreshCw className={`h-4 w-4 ${cloudLoading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                        <div className="p-2.5 bg-slate-50 text-[11px] font-bold text-slate-500 flex items-center justify-between">
                          <span>النسخ المحفوظة على Google Drive</span>
                          <span className="font-mono">مجلد: Cashier_Backups</span>
                        </div>

                        {driveBackups.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                            <FolderArchive className="h-8 w-8 mx-auto text-slate-300 stroke-1" />
                            <p>لا توجد نسخ احتياطية محفوظة على Google Drive حتى الآن</p>
                            <p className="text-[11px] text-slate-400">انقر على الزر أعلاه لحفظ أول نسخة الآن</p>
                          </div>
                        ) : (
                          driveBackups.map((file) => (
                            <div
                              key={file.id}
                              className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 transition"
                            >
                              <div className="overflow-hidden">
                                <h5 className="font-bold text-slate-800 text-xs truncate font-mono" dir="ltr">
                                  {file.name}
                                </h5>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  {file.createdTime
                                    ? new Date(file.createdTime).toLocaleString('ar-EG')
                                    : 'تاريخ غير متوفر'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreFromGoogleDrive(file)}
                                  disabled={cloudLoading}
                                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>استرجاع</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDriveBackup(file)}
                                  disabled={cloudLoading}
                                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                  title="حذف من Google Drive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Firebase Firestore Backups */}
                  {activeCloudTab === 'firestore' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleBackupToFirestore}
                          disabled={cloudLoading}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-xs transition active:scale-98 disabled:opacity-60 cursor-pointer"
                        >
                          {cloudLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Database className="h-4 w-4" />
                          )}
                          <span>حفظ لقطة سحابية على Firebase Firestore</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => currentUser && loadCloudBackups(currentUser)}
                          disabled={cloudLoading}
                          className="p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                          title="تحديث قائمة Firestore"
                        >
                          <RefreshCw className={`h-4 w-4 ${cloudLoading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                        <div className="p-2.5 bg-slate-50 text-[11px] font-bold text-slate-500 flex items-center justify-between">
                          <span>النسخ المحفوظة على قاعدة بيانات Firestore</span>
                          <span className="font-mono">Collection: users/{currentUser.uid.slice(0, 8)}...</span>
                        </div>

                        {firestoreBackups.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                            <Database className="h-8 w-8 mx-auto text-slate-300 stroke-1" />
                            <p>لا توجد لقطات محفوظة في Firestore حتى الآن</p>
                            <p className="text-[11px] text-slate-400">احفظ نسخة فورية مشفرة بضغطة زر واحدة</p>
                          </div>
                        ) : (
                          firestoreBackups.map((item) => (
                            <div
                              key={item.id}
                              className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 transition"
                            >
                              <div className="overflow-hidden">
                                <h5 className="font-bold text-slate-800 text-xs truncate">
                                  {item.fileName}
                                </h5>
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  {item.createdAt
                                    ? new Date(item.createdAt).toLocaleString('ar-EG')
                                    : ''}{' '}
                                  • {item.totalProducts || 0} صنف • {item.totalInvoices || 0} فاتورة
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleRestoreFromFirestore(item)}
                                  disabled={cloudLoading}
                                  className="px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>استرجاع</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFirestoreBackup(item)}
                                  disabled={cloudLoading}
                                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                  title="حذف من Firestore"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Signed Out State - Official Sign in with Google Button */
                <div className="space-y-4 bg-gradient-to-br from-slate-50 to-amber-50/40 p-5 rounded-2xl border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      <Cloud className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-slate-900 text-sm">المزامنة مع Google Drive و Firebase</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        قم بتسجيل الدخول بحساب Google لحفظ واسترجاع فواتيرك ومنتجاتك مباشرة على Google Drive وقاعدة بيانات Firebase السحابية، وضمان عدم ضياع أي بيانات عند تغيير الهاتف أو المتصفح.
                      </p>
                    </div>
                  </div>

                  {/* Official Google Sign-In Button */}
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={cloudLoading}
                      className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200 hover:border-slate-300 shadow-md font-bold text-sm transition active:scale-98 disabled:opacity-60 cursor-pointer"
                    >
                      {cloudLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                      ) : (
                        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                      )}
                      <span>تسجيل الدخول بحساب Google</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 7. أيقونة التطبيق الرسمية */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('app_info')}
            className={`w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right cursor-pointer transition ${
              openSection === 'app_info' ? 'bg-slate-50/80 border-b border-slate-200/80' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-3.5 overflow-hidden">
              <img
                src="/app-icon.svg"
                alt="أيقونة كاشير POS"
                className="h-11 w-11 rounded-2xl border border-slate-200 p-0.5 object-contain shrink-0 shadow-xs"
              />
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">أيقونة التطبيق الرسمية</h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">معلومات وهوية التطبيق المعتمدة</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full hidden sm:inline-block">
                أيقونة معتمدة
              </span>
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                {openSection === 'app_info' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </button>

          {openSection === 'app_info' && (
            <div className="p-4 sm:p-5 animate-in fade-in duration-200">
              <div className="bg-gradient-to-r from-[#1e4663] to-[#16354b] p-5 rounded-2xl text-white shadow-md flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src="/app-icon.svg"
                    alt="أيقونة كاشير POS"
                    className="h-16 w-16 rounded-2xl shadow-lg border border-white/20 bg-white/10 p-1 object-contain shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-slate-900 px-2 py-0.5 rounded-full">
                        أيقونة معتمدة
                      </span>
                      <span className="text-xs text-cyan-200 font-medium">512×512 HD</span>
                    </div>
                    <h4 className="font-black text-lg text-white mt-0.5">أيقونة التطبيق الرسمية</h4>
                    <p className="text-xs text-slate-200 leading-snug">
                      مصممة بجودة عالية ثلاثية الأبعاد لنقاط البيع ومتوافقة مع شاشات الهواتف والمتصفح
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mandatory User Confirmation Dialog for Destructive Operations */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-3xl bg-white text-slate-900 p-6 shadow-2xl space-y-4 border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div
                className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  confirmModal.isDanger
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-teal-100 text-teal-700'
                }`}
              >
                {confirmModal.isDanger ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <RotateCcw className="h-6 w-6" />
                )}
              </div>
              <h3 className="font-black text-base text-slate-900 leading-tight">
                {confirmModal.title}
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
              >
                إلغاء الأمر
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`py-2.5 px-4 rounded-xl font-bold text-xs text-white shadow-xs transition active:scale-98 ${
                  confirmModal.isDanger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
