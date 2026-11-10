
import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../lib/api';
import { guard, useAsync } from '../../lib/hooks';
import { useToast } from '../../components/ToastHost';
import {
  Button,
  Card,
  Input,
  Label,
  Loading,
  Modal,
  Pill,
  Select,
  Table,
} from '../../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9_.@-]{3,64}$/;

const EMPTY = { username: '', email: '', role: 'member' };

export default function UsersPage() {
  const { me } = useApp();
  const toast = useToast();
  const users = useAsync(() => api('/org/users'));

  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendingUserId, setResendingUserId] = useState(null);
  const [accessUserId, setAccessUserId] = useState(null);
  const [editingInvite, setEditingInvite] = useState(null);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  if (!users.data) {
    return <Loading error={users.error} />;
  }

  const set = (key) => (e) => {
    setForm((current) => ({
      ...current,
      [key]: e.target.value,
    }));
  };

  async function create(e) {
    e.preventDefault();
    setFormError('');

    const username = form.username.trim();
    const email = form.email.trim().toLowerCase();

    if (!USERNAME_RE.test(username)) {
      setFormError(
        'Username must be 3–64 characters: letters, digits, _ . @ -'
      );
      return;
    }

    if (!EMAIL_RE.test(email)) {
      setFormError('Enter a valid email address.');
      return;
    }

    if (
      users.data.some(
        (u) => u.email?.toLowerCase() === email
      )
    ) {
      setFormError('A user with that email already exists.');
      return;
    }

    setBusy(true);

    try {
      await api('/org/users', {
        method: 'POST',
        body: {
          username,
          email,
          role: form.role,
        },
      });

      setForm(EMPTY);
      toast.success(
        'Invitation created. The user should receive an invitation email.'
      );

      await users.reload();
    } catch (err) {
      toast.error(
        err?.message || 'Could not create the invitation.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(u) {
    const confirmation = u.password_set
      ? `Delete ${u.username}? Their chats and private documents will be removed. Organisation-shared documents and audit history will be retained.`
      : `Delete the pending invite for ${u.username}? This frees the username and email so you can invite them again.`;
    const confirmed = window.confirm(
      confirmation
    );

    if (!confirmed) return;

    setFormError('');

    try {
      const result = await api(`/org/users/${u.user_id}`, {
        method: 'DELETE',
      });

      toast.success(
        result?.cleanup_status === 'pending'
          ? 'User deleted. Private document cleanup is still processing; the email is available for a new invite.'
          : 'User deleted. Their username and email are available for a new invite.'
      );
      await users.reload();
    } catch (err) {
      toast.error(err?.message || 'Could not delete this user.');
    }
  }

  async function saveInviteDetails(event) {
    event.preventDefault();
    if (!editingInvite) return;

    const username = editingInvite.username.trim();
    const email = editingInvite.email.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      setEditError('Username must be 3–64 characters: letters, digits, _ . @ -');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setEditError('Enter a valid email address.');
      return;
    }

    setEditError('');
    setSavingEdit(true);
    try {
      const result = await api(`/org/users/${editingInvite.userId}`, {
        method: 'PATCH',
        body: { username, email },
      });
      setEditingInvite(null);
      toast.success(
        result.invite_invalidated
          ? 'Invite details updated. Click Resend invite to email a fresh link to the new address.'
          : 'Invite details are unchanged.'
      );
      await users.reload();
    } catch (err) {
      toast.error(err?.message || 'Could not update this invite.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function resend(u) {
    if (resendingUserId !== null) return;

    setFormError('');
    setResendingUserId(u.user_id);

    try {
      await api(`/org/users/${u.user_id}/invite`, {
        method: 'POST',
      });

      toast.success(
        `A new invitation email has been requested for ${u.username}.`
      );

      await users.reload();
    } catch (err) {
      toast.error(
        err?.message || 'Could not resend the invitation.'
      );
    } finally {
      setResendingUserId(null);
    }
  }

  async function toggleAccess(u) {
    const suspend = u.is_active;
    if (
      suspend &&
      !window.confirm(
        `Suspend ${u.username}? They will be signed out and unable to access the app. Their data will be kept.`
      )
    ) {
      return;
    }

    setFormError('');
    setAccessUserId(u.user_id);

    try {
      await api(`/org/users/${u.user_id}/${suspend ? 'suspend' : 'restore'}`, {
        method: 'POST',
      });
      toast.success(
        suspend
          ? `${u.username}'s access has been suspended.`
          : `${u.username}'s access has been restored.`
      );
      await users.reload();
    } catch (err) {
      toast.error(
        err?.message ||
          `Could not ${suspend ? 'suspend' : 'restore'} this account.`
      );
    } finally {
      setAccessUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          Invite a user
        </h2>

        <p className="mb-3 text-sm text-muted">
          They'll get an email with a link to set their own password.
        </p>

        <form onSubmit={guard(create, toast)} className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <Label className="min-w-[160px] flex-1">
              Username
              <Input
                className="mt-1"
                value={form.username}
                onChange={set('username')}
                required
              />
            </Label>

            <Label className="min-w-[200px] flex-1">
              Email
              <Input
                className="mt-1"
                type="email"
                value={form.email}
                onChange={set('email')}
                required
              />
            </Label>

            <Label>
              Role
              <Select
                className="mt-1"
                value={form.role}
                onChange={set('role')}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </Label>

            <Button
              variant="primary"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Inviting…' : 'Send invite'}
            </Button>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}

        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          Members
        </h2>

        <Table
          head={['Username', 'Email', 'Role', 'Status', '']}
          rows={users.data.map((u) => [
            u.username,
            u.email || '—',
            <Pill key={`${u.user_id}-role`}>
              {u.role}
            </Pill>,
            <Pill key={`${u.user_id}-status`}>
              {!u.is_active
                ? 'suspended'
                : u.password_set
                  ? 'active'
                  : 'invited'}
            </Pill>,
            u.user_id === me.user_id ? (
              <span className="text-xs text-muted">
                (you)
              </span>
            ) : (
              <div className="flex gap-2">
                {u.role === 'member' && (
                  <Button
                    size="sm"
                    variant={u.is_active ? 'danger' : 'subtle'}
                    disabled={accessUserId !== null}
                    onClick={guard(() => toggleAccess(u), toast)}
                  >
                    {accessUserId === u.user_id
                      ? 'Saving…'
                      : u.is_active
                        ? 'Suspend'
                        : 'Restore access'}
                  </Button>
                )}

                {!u.password_set && (
                  <>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => {
                        setEditError('');
                        setEditingInvite({
                          userId: u.user_id,
                          username: u.username,
                          email: u.email || '',
                        });
                      }}
                    >
                      Edit invite
                    </Button>
                    <Button
                      size="sm"
                      disabled={resendingUserId !== null}
                      onClick={guard(() => resend(u), toast)}
                    >
                      {resendingUserId === u.user_id
                        ? 'Resending…'
                        : 'Resend invite'}
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  variant="danger"
                  onClick={guard(() => remove(u), toast)}
                >
                  Delete
                </Button>
              </div>
            ),
          ])}
        />
      </Card>

      <Modal
        open={Boolean(editingInvite)}
        onClose={() => {
          if (!savingEdit) setEditingInvite(null);
        }}
        title="Edit pending invite"
        description="Changing either detail invalidates the old invite link. Resend the invite afterward."
        footer={
          <>
            <Button
              type="button"
              onClick={() => setEditingInvite(null)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-invite-form"
              variant="primary"
              disabled={savingEdit}
            >
              {savingEdit ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        {editingInvite && (
          <form
            id="edit-invite-form"
            onSubmit={saveInviteDetails}
            className="space-y-4"
          >
            <Label>
              Username
              <Input
                className="mt-1"
                value={editingInvite.username}
                onChange={(event) =>
                  setEditingInvite((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                required
              />
            </Label>
            <Label>
              Email
              <Input
                className="mt-1"
                type="email"
                value={editingInvite.email}
                onChange={(event) =>
                  setEditingInvite((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />
            </Label>
            {editError && (
              <p role="alert" className="text-sm text-danger">
                {editError}
              </p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
