export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-primary px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 shadow-xl">
        <div className="flex justify-center mb-6">
          <img src="/brand/icon_purple.png" alt="Selta Cleaning" className="h-14 w-14" />
        </div>
        <h1 className="text-center text-xl font-heading font-extrabold text-ink">Admin panelga kirish</h1>
        <p className="mt-1 text-center text-sm text-gray-dark">Selta Cleaning boshqaruv tizimi</p>

        <form className="mt-7 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Email</label>
            <input
              type="email"
              disabled
              placeholder="admin@selta.uz"
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">Parol</label>
            <input
              type="password"
              disabled
              placeholder="••••••••"
              className="w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-brand-primary disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            disabled
            className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white opacity-60 shadow-sm"
          >
            Kirish
          </button>
          <p className="text-center text-xs text-gray">
            Firebase Auth ulanishi Faza 1'da faollashadi
          </p>
        </form>
      </div>
    </div>
  )
}
