import { useEffect, useState } from 'react'
import { GraduationCap, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react'
import { api } from '../api/client'
import type { AdminUser, AdminUserList, AuthUser, UserRoleName } from '../api/types'
import { EmptyState, FormError, Modal, Stat } from '../components/common'
import { formatDate, initials, roleLabels } from '../lib/format'

type Filter = 'ALL' | UserRoleName

const filters: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'TEACHER', label: 'Giáo viên' },
  { key: 'STUDENT', label: 'Học sinh' },
  { key: 'ADMIN', label: 'Quản trị viên' },
]

const roleOrder: UserRoleName[] = ['TEACHER', 'STUDENT', 'ADMIN']

function activityText(u: AdminUser) {
  if (u.role === 'STUDENT') return u.classCount ? `Học ${u.classCount} lớp` : 'Chưa vào lớp nào'
  return `${u.examCount} phòng thi • ${u.classCount} lớp`
}

interface Props {
  currentUser: AuthUser
  notify: (message: string) => void
}

export function AdminUsers({ currentUser, notify }: Props) {
  const [filter, setFilter] = useState<Filter>('ALL')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<AdminUserList | null>(null)
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)

  const load = async () => {
    try {
      setData(await api.listUsers({ role: filter === 'ALL' ? undefined : filter, q: query.trim() || undefined }))
    } catch (err: any) {
      notify(err.message)
    }
  }

  // Tìm kiếm chờ người dùng ngừng gõ một chút rồi mới gọi máy chủ
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [filter, query])

  const remove = async (u: AdminUser) => {
    const warning =
      u.role === 'STUDENT' ? ' Học sinh sẽ bị xóa khỏi các lớp và mất các bài tập đã nộp.' : ''
    if (!window.confirm(`Xóa tài khoản ${u.displayName} (${u.email})?${warning}`)) return
    try {
      await api.deleteUser(u.id)
      notify(`Đã xóa tài khoản ${u.email}.`)
      void load()
    } catch (err: any) {
      notify(err.message)
    }
  }

  const totals = data?.totals ?? { ADMIN: 0, TEACHER: 0, STUDENT: 0 }
  const users = data?.users ?? []

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={14} /> QUẢN TRỊ HỆ THỐNG
          </div>
          <h1>Quản lý người dùng</h1>
          <p>Thêm, sửa vai trò, đặt lại mật khẩu cho giáo viên và học sinh.</p>
        </div>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={18} /> Thêm người dùng
        </button>
      </div>

      <section className="stats-grid">
        <Stat icon={<Users size={20} />} tone="blue" label="Tổng người dùng" value={String(totals.ADMIN + totals.TEACHER + totals.STUDENT)} note="Tất cả tài khoản" />
        <Stat icon={<UserCog size={20} />} tone="violet" label="Giáo viên" value={String(totals.TEACHER)} note="Tạo phòng thi, lớp học" />
        <Stat icon={<GraduationCap size={20} />} tone="green" label="Học sinh" value={String(totals.STUDENT)} note="Làm bài thi và bài tập" />
        <Stat icon={<ShieldCheck size={20} />} tone="amber" label="Quản trị viên" value={String(totals.ADMIN)} note="Toàn quyền hệ thống" />
      </section>

      <section className="panel students-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">TÀI KHOẢN</div>
            <h2>
              Danh sách người dùng <span className="count-badge">{users.length}</span>
            </h2>
          </div>
          <div className="toolbar">
            <div className="segmented" role="tablist" aria-label="Lọc theo vai trò">
              {filters.map((f) => (
                <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            <label className="search-box">
              <Search size={14} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc email" aria-label="Tìm người dùng" />
            </label>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NGƯỜI DÙNG</th>
                <th>VAI TRÒ</th>
                <th>ĐĂNG NHẬP</th>
                <th>HOẠT ĐỘNG</th>
                <th>NGÀY TẠO</th>
                <th className="align-right">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const isSelf = u.id === currentUser.id
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="student-cell">
                        <div className={`student-avatar avatar-${i % 5}`}>{initials(u.displayName)}</div>
                        <div>
                          <strong>
                            {u.displayName}
                            {isSelf && <em className="self-tag">Bạn</em>}
                          </strong>
                          <span>{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-pill ${u.role.toLowerCase()}`}>{roleLabels[u.role]}</span>
                    </td>
                    <td>{u.loginMethod === 'GOOGLE' ? 'Google' : 'Email + mật khẩu'}</td>
                    <td>{activityText(u)}</td>
                    <td className="time-cell">{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="plain-action" onClick={() => setEditing(u)}>
                          <Pencil size={13} /> Sửa
                        </button>
                        {!isSelf && (
                          <button className="reject-button" title="Xóa tài khoản" aria-label={`Xóa ${u.email}`} onClick={() => void remove(u)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data && users.length === 0 && (
            <EmptyState icon={<Users size={24} />} title="Không có người dùng phù hợp" detail="Thử đổi bộ lọc hoặc từ khóa tìm kiếm." />
          )}
          {!data && <p className="loading-state table-loading">Đang tải danh sách người dùng...</p>}
        </div>
      </section>

      {editing && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === currentUser.id}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            notify(message)
            void load()
          }}
        />
      )}
    </>
  )
}

function UserFormModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUser | null
  isSelf: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [role, setRole] = useState<UserRoleName>(user?.role ?? 'STUDENT')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!user && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Email không đúng định dạng.')
    if (displayName.trim().length < 2) return setError('Họ tên phải từ 2 ký tự.')
    if (password && password.length < 8) return setError('Mật khẩu phải từ 8 ký tự trở lên.')
    setSaving(true)
    setError('')
    try {
      if (user) {
        await api.updateUser(user.id, {
          displayName: displayName.trim() !== user.displayName ? displayName.trim() : undefined,
          role: role !== user.role ? role : undefined,
          password: password || undefined,
        })
        onSaved(`Đã cập nhật tài khoản ${user.email}.`)
      } else {
        const created = await api.createUser({ email: email.trim(), displayName: displayName.trim(), role, password: password || undefined })
        onSaved(`Đã tạo tài khoản ${roleLabels[created.role].toLowerCase()} ${created.email}.`)
      }
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const unchanged = Boolean(user && displayName.trim() === user.displayName && role === user.role && !password)

  return (
    <Modal
      kicker={user ? 'CẬP NHẬT TÀI KHOẢN' : 'TÀI KHOẢN MỚI'}
      title={user ? user.displayName : 'Thêm người dùng'}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="button primary" disabled={saving || unchanged}>
            {saving ? 'Đang lưu...' : user ? 'Lưu thay đổi' : 'Tạo tài khoản'}
          </button>
        </>
      }
    >
      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(user)} placeholder="ten@truonghoc.vn" autoFocus={!user} />
      <label>Họ và tên</label>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ví dụ: Nguyễn Văn A" autoFocus={Boolean(user)} />
      <label>Vai trò</label>
      <div className="duration-options role-picker" role="radiogroup" aria-label="Vai trò">
        {roleOrder.map((r) => (
          <button type="button" key={r} role="radio" aria-checked={role === r} className={role === r ? 'selected' : ''} disabled={isSelf} onClick={() => setRole(r)}>
            {roleLabels[r]}
          </button>
        ))}
      </div>
      {isSelf && <p className="field-hint">Bạn không thể tự đổi vai trò của chính mình.</p>}
      {role === 'ADMIN' && !isSelf && <p className="field-hint warn">Quản trị viên có toàn quyền: quản lý mọi tài khoản, phòng thi và lớp học.</p>}
      <label>
        <KeyRound size={12} /> {user ? 'Đặt mật khẩu mới' : 'Mật khẩu'}
      </label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 8 ký tự" autoComplete="new-password" />
      <p className="field-hint">
        {user
          ? user.loginMethod === 'GOOGLE'
            ? 'Tài khoản đang đăng nhập bằng Google. Đặt mật khẩu nếu muốn đăng nhập thêm bằng email + mật khẩu.'
            : 'Để trống nếu giữ nguyên mật khẩu hiện tại.'
          : 'Để trống nếu người dùng đăng nhập bằng nút "Tiếp tục với Google" với đúng email này.'}
      </p>
      <FormError message={error} />
    </Modal>
  )
}
