import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[320px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="bg-foreground/85 text-background mb-4 flex size-9 items-center justify-center rounded-[5px] text-base font-semibold">
            B
          </div>
          <h1 className="text-xl font-semibold">Sign in to Beale&rsquo;s CRM</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Accounts are created by an admin.
          </p>
        </div>

        <LoginForm next={next ?? '/dashboard'} />
      </div>
    </main>
  )
}
