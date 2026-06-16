import Link from "next/link";

import { AuthForm } from "@/components/blocks/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="font-display text-2xl">Create your account</CardTitle>
        <CardDescription>Get started in less than a minute.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthForm mode="sign-up" />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
