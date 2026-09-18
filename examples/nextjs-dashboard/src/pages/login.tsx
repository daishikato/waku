import AcmeLogo from '@/ui/acme-logo';
import LoginForm from '@/ui/login-form';

export default function LoginPage() {
  return (
    <main className="flex items-center justify-center md:h-screen">
      <title>Login | Acme Dashboard</title>
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
        <div className="flex h-20 w-full items-end rounded-lg bg-blue-500 p-3 md:h-36">
          <div className="w-32 text-white md:w-36">
            <AcmeLogo />
          </div>
        </div>
        {/* The original wraps LoginForm in <Suspense> because useSearchParams()
            opts a Next.js page into client-side rendering. Waku's useRouter()
            carries no such requirement, so the boundary is gone. */}
        <LoginForm />
      </div>
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
