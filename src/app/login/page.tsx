import Image from 'next/image'

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
          <Image
            src="/beales-logo.png"
            alt="Beale's LLC"
            width={2000}
            height={1489}
            priority
            className="mb-5 h-auto w-[190px]"
          />
          <div className="brand-gradient mb-5 h-1 w-16 rounded-full" />
          <h1 className="text-xl">Sign in</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Internal CRM. Accounts are created by an admin.
          </p>
        </div>

        <LoginForm next={next ?? '/dashboard'} />
      </div>
    </main>
  )
}
