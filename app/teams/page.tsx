'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { TeamMembersModal } from '@/components/team-members-modal';
import { InviteUserForm } from '@/components/forms/invite-user-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Team {
  id: number
  name: string
  team_lead_id: number | null
}

interface User {
  id: number;
  employee_name: string;
  email?: string;
  user_role?: string;
  status?: 'pending' | 'active';
}

export default function TeamsPage() {
  const { data: session } = useSession()
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedLead, setSelectedLead] = useState<string>('');
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    if (session) {
      fetchTeams()
      fetchUsers()
    }
  }, [session])

  const fetchTeams = async () => {
    const response = await fetch('/api/teams')
    const data = await response.json()
    if (data.status === 'success') {
      setTeams(data.teams)
    }
  }

  const fetchUsers = async () => {
    const response = await fetch('/api/users')
    const data = await response.json()
    if (data.status === 'success') {
      setUsers(data.users)
    }
  }

  const handleCreateTeam = async () => {
    const response = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTeamName, team_lead_id: selectedLead || null }),
    })

    if (response.ok) {
      toast.success('Team created successfully')
      setNewTeamName('')
      setSelectedLead('')
      fetchTeams()
    } else {
      toast.error('Failed to create team')
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Team Management</h1>
        <Button onClick={() => setShowInviteModal(true)}>
          Invite User
        </Button>
      </div>

      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
          </DialogHeader>
          <InviteUserForm 
            onSuccess={() => {
              setShowInviteModal(false);
              fetchUsers(); // Refresh user list to show pending user
            }}
            onCancel={() => setShowInviteModal(false)}
          />
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <Card key={team.id}>
            <CardHeader>
              <CardTitle>{team.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Team Lead: {users.find(u => u.id === team.team_lead_id)?.employee_name || 'Not assigned'}
              </p>
              <div className="mt-4">
                <TeamMembersModal team={team} users={users} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found in this organization yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border/60">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-2 text-foreground">{user.id}</td>
                      <td className="px-4 py-2 text-foreground">{user.employee_name}</td>
                      <td className="px-4 py-2 text-foreground">{user.email || 'N/A'}</td>
                      <td className="px-4 py-2 text-foreground">{user.user_role || 'user'}</td>
                      <td className="px-4 py-2 text-foreground">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${(user.status === 'active' || !user.status) ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {user.status || 'active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Invited users will appear here after they complete registration and log in for the first time.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
