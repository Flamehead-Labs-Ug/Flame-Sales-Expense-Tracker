"use client";

import { useState, useEffect, ChangeEvent } from 'react';
import { useUser } from '@stackframe/stack';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { User } from '@/lib/types';

function UsersPageContent() {
  const user = useUser();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editableName, setEditableName] = useState('');
  const [editablePhone, setEditablePhone] = useState('');

  const getInitials = () => {
    const name =
      editableName ||
      profile?.employee_name ||
      user?.displayName ||
      profile?.email ||
      user?.primaryEmail ||
      '';
    const parts = name.trim().split(' ');
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.primaryEmail) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/users');
        const data = await response.json();
        if (data.status === 'success') {
          const found = (data.users as User[]).find((u) => u.email === user.primaryEmail);
          setProfile(found || null);
          setEditableName(found?.employee_name || user.displayName || '');
          setEditablePhone(found?.phone_number || '');
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadProfile();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;

    try {
      const response = await fetch('/api/users', { method: 'DELETE' });
      const data = await response.json();

      if (response.ok && data.status === 'success') {
        toast.success('Your account has been deleted');
        if (user) {
          user.signOut();
        }
      } else {
        toast.error(data.message || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      toast.error('Failed to delete account');
    }
  };

  const handleSaveProfile = async () => {
    if (!profile && !user?.primaryEmail) return;

    try {
      setSaving(true);
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_name: editableName || null,
          phone_number: editablePhone || null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        toast.success('Profile updated');
        setProfile((prev) =>
          prev
            ? { ...prev, employee_name: editableName || prev.employee_name, phone_number: editablePhone || prev.phone_number }
            : prev,
        );
      } else {
        toast.error(data.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading profile...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">My Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your personal account details.</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 space-y-4">
          <div>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white text-2xl font-semibold">
                {getInitials()}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Account Information</h2>
                <p className="text-sm text-muted-foreground mt-1">These details come from your organization account.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Name</label>
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                value={editableName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditableName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Email</label>
              <div className="px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm">
                {profile?.email || user?.primaryEmail || 'N/A'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Role</label>
              <div className="px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm">
                {profile?.user_role || 'user'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Phone</label>
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                value={editablePhone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditablePhone(e.target.value)}
                placeholder="Add a phone number"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">User ID</label>
              <div className="px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm">
                {profile?.id ?? 'N/A'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Joined</label>
              <div className="px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm">
                {profile?.created_at ? new Date(profile.created_at).toLocaleString() : 'N/A'}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
            <p className="text-sm text-red-800 mt-1">
              Deleting your account will remove your user record from this workspace. This action cannot be undone.
            </p>
          </div>
          <Button variant="destructive" onClick={handleDeleteAccount}>
            Delete Account
          </Button>
        </div>
      </div>
    </AuthGuard>
  );
}

export default function UsersPage() {
  return <UsersPageContent />
}