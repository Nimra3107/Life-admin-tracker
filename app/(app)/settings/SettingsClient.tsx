'use client'

import { useState } from 'react'
import { createBrowserApi } from '@/lib/api/client'
import { User, Lock, Trash2 } from 'lucide-react'

interface Props {
  userEmail: string
  userId: string
}

export default function SettingsClient({ userEmail, userId }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')

    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }

    setPwLoading(true)
    const { error } = await createBrowserApi().auth.changePassword(newPassword)
    setPwLoading(false)

    if (error) { setPwError(error.message); return }
    setPwSuccess('Password updated successfully!')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1'

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account preferences.</p>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
            <User className="w-4 h-4 text-teal-600" />
          </div>
          <h2 className="font-semibold text-slate-900">Account</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Email address</label>
            <input
              type="email"
              value={userEmail}
              disabled
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">Email cannot be changed here.</p>
          </div>
          <div>
            <label className={labelClass}>User ID</label>
            <input
              type="text"
              value={userId}
              disabled
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-400 cursor-not-allowed font-mono"
            />
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
            <Lock className="w-4 h-4 text-teal-600" />
          </div>
          <h2 className="font-semibold text-slate-900">Change Password</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          {pwError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{pwError}</div>
          )}
          {pwSuccess && (
            <div className="bg-teal-50 border border-teal-200 text-teal-700 px-4 py-3 rounded-lg text-sm">{pwSuccess}</div>
          )}
          <div>
            <label htmlFor="new_password" className={labelClass}>New Password</label>
            <input
              id="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="confirm_password" className={labelClass}>Confirm New Password</label>
            <input
              id="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={pwLoading}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Lock className="w-4 h-4" />
            {pwLoading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-red-500" />
          </div>
          <h2 className="font-semibold text-slate-900">Danger Zone</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          To delete your account, please contact support. Account deletion removes all your items and categories permanently.
        </p>
        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-medium">
          Account deletion available via support
        </div>
      </div>
    </div>
  )
}
