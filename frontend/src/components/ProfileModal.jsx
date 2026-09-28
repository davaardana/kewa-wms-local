import React, { useEffect, useState } from 'react';
import { KeyRound, Save, User, X } from 'lucide-react';
import { authApi } from '../services/api';
import { showToast } from './Toast';
import Portal from './Portal';

const errorMessage = (error) => {
  const errors = error.response?.data?.errors;
  return errors ? Object.values(errors).flat()[0] : (error.response?.data?.message || error.message);
};

export default function ProfileModal({ isOpen, user, onClose, onUserUpdated }) {
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  const [password, setPassword] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (isOpen && user) setProfile({ name: user.name || '', email: user.email || '', phone: user.phone || '' });
  }, [isOpen, user]);

  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose();
    if (isOpen) window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const response = await authApi.updateProfile(profile);
      onUserUpdated(response.data.user);
      showToast('Profil berhasil diperbarui.', 'success');
    } catch (error) {
      showToast(`Profil gagal diperbarui: ${errorMessage(error)}`, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setSavingPassword(true);
    try {
      await authApi.changePassword(password);
      setPassword({ current_password: '', password: '', password_confirmation: '' });
      showToast('Password berhasil diperbarui.', 'success');
    } catch (error) {
      showToast(`Password gagal diperbarui: ${errorMessage(error)}`, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-xs" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-labelledby="profile-title" className="my-auto w-full max-w-2xl rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div><h2 id="profile-title" className="font-bold text-slate-900">Profil Saya</h2><p className="text-xs text-slate-500">Berlaku untuk akun {user.role}</p></div>
            <button type="button" aria-label="Tutup profil" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </header>
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <form onSubmit={saveProfile} className="space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-800"><User className="h-4 w-4" /> Data Profil</h3>
              <label className="block text-xs font-semibold text-slate-600">Nama<input required maxLength={150} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={`${inputClass} mt-1`} /></label>
              <label className="block text-xs font-semibold text-slate-600">Email<input required type="email" maxLength={150} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className={`${inputClass} mt-1`} /></label>
              <label className="block text-xs font-semibold text-slate-600">Nomor HP<input maxLength={50} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className={`${inputClass} mt-1`} /></label>
              <button disabled={savingProfile} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Save className="h-4 w-4" />{savingProfile ? 'Menyimpan...' : 'Simpan Profil'}</button>
            </form>
            <form onSubmit={savePassword} className="space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-800"><KeyRound className="h-4 w-4" /> Ubah Password</h3>
              <label className="block text-xs font-semibold text-slate-600">Password Saat Ini<input required type="password" autoComplete="current-password" value={password.current_password} onChange={(e) => setPassword({ ...password, current_password: e.target.value })} className={`${inputClass} mt-1`} /></label>
              <label className="block text-xs font-semibold text-slate-600">Password Baru<input required type="password" minLength={8} autoComplete="new-password" value={password.password} onChange={(e) => setPassword({ ...password, password: e.target.value })} className={`${inputClass} mt-1`} /></label>
              <label className="block text-xs font-semibold text-slate-600">Konfirmasi Password<input required type="password" minLength={8} autoComplete="new-password" value={password.password_confirmation} onChange={(e) => setPassword({ ...password, password_confirmation: e.target.value })} className={`${inputClass} mt-1`} /></label>
              <button disabled={savingPassword} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><KeyRound className="h-4 w-4" />{savingPassword ? 'Menyimpan...' : 'Ubah Password'}</button>
            </form>
          </div>
        </div>
      </div>
    </Portal>
  );
}