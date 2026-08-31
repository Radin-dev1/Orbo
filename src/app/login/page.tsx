import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in · Orbo" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
