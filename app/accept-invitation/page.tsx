'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const token = searchParams.get('token');

  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ email: string, username: string, organizationName: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invitation token is missing or invalid.');
      setIsValidating(false);
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch(`/api/accept-invitation?token=${token}`);
        const data = await response.json();
        if (response.ok) {
          setUserInfo(data.user);
        } else {
          setError(data.message || 'Invalid or expired invitation.');
        }
      } catch (err) {
        setError('An unexpected error occurred.');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  useEffect(() => {
    // If user is authenticated, attempt to activate the account
    if (status === 'authenticated' && userInfo) {
      const activateAccount = async () => {
        try {
          const response = await fetch('/api/accept-invitation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const data = await response.json();
          if (response.ok) {
            toast.success('Account activated successfully! Redirecting...');
            router.push('/');
          } else {
            setError(data.message || 'Failed to activate account.');
          }
        } catch (err) {
          setError('An unexpected error occurred during activation.');
        }
      };
      activateAccount();
    }
  }, [status, userInfo, token, router]);

  if (isValidating) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userInfo && status !== 'authenticated') {
    return (
      <div className="flex justify-center items-center h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Accept Your Invitation</CardTitle>
            <CardDescription>You've been invited to join <strong>{userInfo.organizationName}</strong>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Please sign in with your Google account (<strong>{userInfo.email}</strong>) to activate your account.</p>
            <Button onClick={() => signIn('google')} className="w-full">
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div className="flex justify-center items-center h-screen">Redirecting...</div>;
}

export default function AcceptInvitationPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AcceptInvitationContent />
        </Suspense>
    )
}
