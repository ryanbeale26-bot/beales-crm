import { PasswordForm } from '@/app/(app)/settings/password-form'
import { PageHeader, Property, Row, RowList, SectionTitle } from '@/components/page-header'
import { getCurrentProfile } from '@/lib/reference'
import { ADMIN_SECTIONS } from '@/lib/settings'

export const metadata = { title: 'Settings' }

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  leadership: 'Leadership',
  field: 'Field',
}

export default async function SettingsPage() {
  const profile = await getCurrentProfile()
  const isAdmin = profile?.role === 'admin'

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your own account, and — if you are an admin — everything behind the scenes."
      />

      <SectionTitle>Your account</SectionTitle>
      <dl className="border-border border-t py-2">
        <Property label="Name">{profile?.full_name || '—'}</Property>
        <Property label="Email">{profile?.email || '—'}</Property>
        <Property label="Role">
          {profile ? (ROLE_LABEL[profile.role] ?? profile.role) : '—'}
        </Property>
        <Property label="Pay rates">
          {profile?.sees_rates
            ? 'You can see pay rates, bill rates and labour margin'
            : 'Pay rates, bill rates and labour margin are hidden from you'}
        </Property>
      </dl>
      <p className="text-muted-foreground mt-2 text-sm">
        Your name and what you can see are set by an admin. Ask Ryan if any of it is wrong.
      </p>

      <SectionTitle>Change your password</SectionTitle>
      <PasswordForm email={profile?.email ?? ''} />

      {isAdmin && (
        <>
          <SectionTitle>Administration</SectionTitle>
          <p className="text-muted-foreground mb-2 text-sm">
            Only you and the other admins see this. Nobody else has these rows at all.
          </p>
          <RowList>
            {ADMIN_SECTIONS.map((s) => (
              <Row key={s.href} href={s.href} title={s.title} meta={s.blurb} />
            ))}
          </RowList>
        </>
      )}

      <SectionTitle>Sign out</SectionTitle>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="border-border row-hover rounded-[3px] border px-2.5 py-1 text-sm"
        >
          Sign out of Beale&rsquo;s CRM
        </button>
      </form>
    </div>
  )
}
