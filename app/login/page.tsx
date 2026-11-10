import { signIn } from "@/auth";
import { Lock, ShieldAlert } from "lucide-react";

interface LoginPageProps {
  searchParams: Promise<{
    error?: string;
    callbackUrl?: string;
  }>;
}

const getErrorMessage = (err: string) => {
  switch (err) {
    case "AccessDenied":
      return {
        title: "Email của bạn không có quyền truy cập.",
        detail: "Tài khoản Google này không nằm trong danh sách AUTH_OWNER_EMAILS được cấp quyền.",
      };
    case "Configuration":
    case "MissingSecret":
      return {
        title: "Chưa cấu hình biến môi trường Auth.",
        detail: "Vercel đang thiếu AUTH_SECRET hoặc AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET.",
      };
    case "OAuthCallbackError":
    case "OAuthSignInError":
    case "OAuthSignin":
      return {
        title: "Lỗi kết nối Google OAuth.",
        detail: "Kiểm tra Redirect URI (https://crisne.blog/api/auth/callback/google) trên Google Cloud Console.",
      };
    default:
      return {
        title: `Lỗi xác thực: ${err}`,
        detail: "Vui lòng kiểm tra cấu hình biến môi trường hoặc log của máy chủ.",
      };
  }
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, callbackUrl } = await searchParams;
  const errorInfo = error ? getErrorMessage(error) : null;

  const handleSignIn = async () => {
    "use server";
    await signIn("google", { redirectTo: callbackUrl || "/" });
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-[26rem] rounded-2xl border border-border/60 bg-card p-8 shadow-xl text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Cris.dev
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Workspace cá nhân riêng tư. Vui lòng đăng nhập bằng tài khoản Google của Owner để tiếp tục.
        </p>

        {errorInfo && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-left text-sm text-destructive">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{errorInfo.title}</p>
              <p className="text-xs opacity-90 mt-0.5">{errorInfo.detail}</p>
            </div>
          </div>
        )}

        <form action={handleSignIn} className="mt-8">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            Đăng nhập với Google
          </button>
        </form>
      </div>
    </main>
  );
}
