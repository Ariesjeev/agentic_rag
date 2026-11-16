
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
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmingAction, setConfirmingAction] = useState(false);
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

  async function changeAccess(u, suspend) {
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

  function requestAccessChange(u) {
    if (u.is_active) {
      setPendingAction({ type: 'suspend', user: u });
      return;
    }

    return changeAccess(u, false);
  }

  async function confirmMemberAction() {
    if (!pendingAction || confirmingAction) return;
    const { type, user } = pendingAction;
    setConfirmingAction(true);

    try {
      if (type === 'delete') {
        const result = await api(`/org/users/${user.user_id}`, {
          method: 'DELETE',
        });
        toast.success(
          result?.cleanup_status === 'pending'
            ? 'User deleted. Private document cleanup is still processing; the email is available for a new invite.'
            : 'User deleted. Their username and email are available for a new invite.'
        );
      } else {
        await api(`/org/users/${user.user_id}/suspend`, { method: 'POST' });
        toast.success(`${user.username}'s access has been suspended.`);
      }

      setPendingAction(null);
      await users.reload();
    } catch (err) {
      toast.error(
        err?.message ||
          `Could not ${type === 'delete' ? 'delete' : 'suspend'} this account.`
      );
    } finally {
      setConfirmingAction(false);
    }
  }

  function renderUserActions(u) {
    if (u.user_id === me.user_id) {
      return <span className="text-xs text-muted">(you)</span>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {u.role === 'member' && (
          <Button
            size="sm"
            variant={u.is_active ? 'danger' : 'subtle'}
            disabled={accessUserId !== null}
            onClick={guard(() => requestAccessChange(u), toast)}
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
              {resendingUserId === u.user_id ? 'Resending…' : 'Resend invite'}
            </Button>
          </>
        )}

        <Button
          size="sm"
          variant="danger"
          onClick={() => setPendingAction({ type: 'delete', user: u })}
        >
          Delete
        </Button>
      </div>
    );
  }

  function userStatus(u) {
    return !u.is_active ? 'suspended' : u.password_set ? 'active' : 'invited';
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          Invite a user
        </h2>

        <p className="mb-3 text-sm text-muted">
          They'll get an email with a link to set their own password.
        </p>

        <form onSubmit={guard(create, toast)} className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto] xl:items-end">
            <Label className="min-w-0">
              Username
              <Input
                className="mt-1"
                value={form.username}
                onChange={set('username')}
                required
              />
            </Label>

            <Label className="min-w-0">
              Email
              <Input
                className="mt-1"
                type="email"
                value={form.email}
                onChange={set('email')}
                required
              />
            </Label>

            <Label className="sm:col-span-1">
              Role
              <Select
                className="mt-1 w-full sm:w-auto"
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
              className="w-full sm:w-auto"
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

      <Card className="min-w-0">
        <h2 className="mb-3 text-lg font-semibold">
          Members
        </h2>

        <div className="hidden md:block">
          <Table
          head={['Username', 'Email', 'Role', 'Status', '']}
          rows={users.data.map((u) => [
            <span className="break-all" key={`${u.user_id}-username`}>{u.username}</span>,
            u.email || '—',
            <Pill key={`${u.user_id}-role`}>
              {u.role}
            </Pill>,
            <Pill key={`${u.user_id}-status`}>
              {userStatus(u)}
            </Pill>,
            renderUserActions(u),
          ])}
        />
        </div>

        <div className="space-y-3 md:hidden">
          {users.data.map((u) => (
            <article
              key={u.user_id}
              className="min-w-0 rounded-xl border border-border bg-surface-2/40 p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all font-medium text-ink">{u.username}</p>
                  <p className="mt-1 break-all text-sm text-muted">{u.email || '—'}</p>
                </div>
                <Pill>{userStatus(u)}</Pill>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <Pill>{u.role}</Pill>
                {renderUserActions(u)}
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Modal
        open={Boolean(pendingAction)}
        onClose={() => {
          if (!confirmingAction) setPendingAction(null);
        }}
        title={pendingAction?.type === 'delete' ? 'Delete this member?' : 'Suspend this member?'}
        description={
          pendingAction?.type === 'delete'
            ? `Are you sure you want to delete ${pendingAction.user.username}? Their chats and private documents will be removed. Organisation-shared documents and audit history will be retained.`
            : `Are you sure you want to suspend ${pendingAction?.user.username}? They will be signed out and cannot access the app. Their account and data will be kept.`
        }
        footer={
          <>
            <Button
              onClick={() => setPendingAction(null)}
              disabled={confirmingAction}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={guard(confirmMemberAction, toast)}
              disabled={confirmingAction}
              className="w-full sm:w-auto"
            >
              {confirmingAction
                ? 'Please wait…'
                : pendingAction?.type === 'delete'
                  ? 'Delete member'
                  : 'Suspend member'}
            </Button>
          </>
        }
      />

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
