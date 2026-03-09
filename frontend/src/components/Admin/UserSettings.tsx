import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../services/api';
import styles from './UserSettings.module.css';

export default function UserSettings() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  // Profile form
  const [slug, setSlug] = useState(user?.slug ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setSlug(user.slug);
      setEmail(user.email);
    }
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);
    const updates: { slug?: string; email?: string } = {};
    if (slug !== user?.slug) updates.slug = slug;
    if (email !== user?.email) updates.email = email;
    if (Object.keys(updates).length === 0) return;

    setProfileLoading(true);
    try {
      await authApi.updateProfile(updates);
      const { data } = await authApi.me();
      updateUser(data);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setProfileError(msg ?? 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    setPasswordLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPasswordError(msg ?? 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className={styles['user-settings']}>
      <section className={styles['settings-section']}>
        <h2 className={styles['section-title']}>Profile</h2>
        <p className={styles['section-desc']}>
          Your username is used in public collection URLs (e.g. <code>/{slug}/my-collection</code>).
          Changing it will update all your collection links.
        </p>
        <form className={styles['settings-form']} onSubmit={handleProfileSave}>
          <div className={styles['form-field']}>
            <label className={styles['form-label']} htmlFor="us-slug">Username</label>
            <input
              id="us-slug"
              className={styles['form-input']}
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="your-username"
              maxLength={64}
              required
            />
          </div>
          <div className={styles['form-field']}>
            <label className={styles['form-label']} htmlFor="us-email">Email</label>
            <input
              id="us-email"
              className={styles['form-input']}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {profileError && <p className={styles['form-error']}>{profileError}</p>}
          {profileSuccess && <p className={styles['form-success']}>Profile updated.</p>}
          <button
            type="submit"
            className={styles['save-btn']}
            disabled={profileLoading}
          >
            {profileLoading ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </section>

      <div className={styles['divider']} />

      <section className={styles['settings-section']}>
        <h2 className={styles['section-title']}>Change Password</h2>
        <form className={styles['settings-form']} onSubmit={handlePasswordChange}>
          <div className={styles['form-field']}>
            <label className={styles['form-label']} htmlFor="us-current-pw">Current Password</label>
            <input
              id="us-current-pw"
              className={styles['form-input']}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
            />
          </div>
          <div className={styles['form-field']}>
            <label className={styles['form-label']} htmlFor="us-new-pw">New Password</label>
            <input
              id="us-new-pw"
              className={styles['form-input']}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div className={styles['form-field']}>
            <label className={styles['form-label']} htmlFor="us-confirm-pw">Confirm New Password</label>
            <input
              id="us-confirm-pw"
              className={styles['form-input']}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              required
            />
          </div>
          {passwordError && <p className={styles['form-error']}>{passwordError}</p>}
          {passwordSuccess && <p className={styles['form-success']}>Password changed successfully.</p>}
          <button
            type="submit"
            className={styles['save-btn']}
            disabled={passwordLoading}
          >
            {passwordLoading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </section>
    </div>
  );
}
