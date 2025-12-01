'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useUser, useStackApp } from '@stackframe/stack'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { navigation } from '@/components/navigation'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ModeToggle } from '@/components/mode-toggle'

export function AppSidebar() {
  const pathname = usePathname()
  const user = useUser()
  const app = useStackApp()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-3 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary overflow-hidden">
            <Image
              src="/images/logo/flame-logo.jpg"
              alt="Flame logo"
              width={32}
              height={32}
              className="object-cover"
              priority
            />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/70">
              Flame
            </span>
            <span className="text-sm font-semibold text-sidebar-foreground">
              Sales &amp; Expense
            </span>
            <span className="text-[11px] text-sidebar-foreground/60">
              Tracker
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const Icon = item.icon as React.ComponentType<React.SVGProps<SVGSVGElement>> | undefined

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.name}
                    >
                      <Link href={item.href}>
                        {Icon && <Icon className="h-4 w-4" />}
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-2 border-t border-sidebar-border px-2 py-2 text-xs group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between gap-3">
            {user ? (
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {(user.displayName ?? user.primaryEmail ?? 'U')
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <div className="font-medium truncate">{user.displayName ?? 'User'}</div>
                  <div className="text-muted-foreground truncate">{user.primaryEmail}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                <span>Not signed in</span>
              </div>
            )}

            <ModeToggle />
          </div>

          {user ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={() => user.signOut()}
            >
              Sign Out
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center"
              onClick={() => app.signInWithOAuth('google')}
            >
              Sign In
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
