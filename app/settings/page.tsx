"use client";

import { useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import UsersPage from '@/app/users/page';
import TeamsPage from '@/app/teams/page';
import OrganizationsPage from '@/app/organizations/page';
import ProjectsPage from '@/app/projects/page';
import CategoriesPage from '@/app/categories/page';
import VendorsPage from '@/app/vendors/page';
import PaymentMethodsPage from '@/app/payment-methods/page';

type SettingsSection =
  | 'profile'
  | 'teams'
  | 'organizations'
  | 'projects'
  | 'categories'
  | 'vendors'
  | 'paymentMethods';

export default function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>('profile');

  return (
    <AuthGuard>
      <div className="flex flex-col md:flex-row gap-6 p-6 max-w-6xl mx-auto">
        {/* Navigation column */}
        <aside className="w-full md:w-64 space-y-2 border border-border rounded-lg bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">Navigation</h2>
          <Button
            variant={section === 'organizations' ? 'default' : 'outline'}
            className="w-full justify-start"
            onClick={() => setSection('organizations')}
          >
            Organizations
          </Button>
          <Button
            variant={section === 'projects' ? 'default' : 'outline'}
            className="w-full justify-start"
            onClick={() => setSection('projects')}
          >
            Projects
          </Button>
          <Button
            variant={section === 'categories' ? 'default' : 'outline'}
            className="w-full justify-start"
            onClick={() => setSection('categories')}
          >
            Categories
          </Button>
          <Button
            variant={section === 'vendors' ? 'default' : 'outline'}
            className="w-full justify-start"
            onClick={() => setSection('vendors')}
          >
            Vendors
          </Button>
          <Button
            variant={section === 'paymentMethods' ? 'default' : 'outline'}
            className="w-full justify-start"
            onClick={() => setSection('paymentMethods')}
          >
            Payment Methods
          </Button>
          <Button
            variant={section === 'profile' ? 'default' : 'outline'}
            className="w-full justify-start"
            onClick={() => setSection('profile')}
          >
            User Profile
          </Button>
        </aside>

        {/* Content area */}
        <section className="flex-1 min-h-[60vh] space-y-4">
          {section === 'profile' && (
            <div className="space-y-4">
              <UsersPage />
            </div>
          )}

          {section === 'teams' && (
            <div className="space-y-4">
              <TeamsPage />
            </div>
          )}

          {section === 'organizations' && (
            <div className="space-y-4">
              <OrganizationsPage />
            </div>
          )}

          {section === 'projects' && (
            <div className="space-y-4">
              <ProjectsPage />
            </div>
          )}

          {section === 'categories' && (
            <div className="space-y-4">
              <CategoriesPage />
            </div>
          )}

          {section === 'vendors' && (
            <div className="space-y-4">
              <VendorsPage />
            </div>
          )}

          {section === 'paymentMethods' && (
            <div className="space-y-4">
              <PaymentMethodsPage />
            </div>
          )}
        </section>
      </div>
    </AuthGuard>
  );
}
