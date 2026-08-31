import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Create account · Orbo" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
