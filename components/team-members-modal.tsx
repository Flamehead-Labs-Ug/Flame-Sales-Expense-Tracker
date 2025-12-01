'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Team {
  id: number
  name: string
}

interface User {
  id: number
  employee_name: string
}

interface TeamMember {
  user_id: number
  team_id: number
  role: string
}

export function TeamMembersModal({ team, users }: { team: Team; users: User[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')

  useEffect(() => {
    if (isOpen) {
      fetchMembers()
    }
  }, [isOpen])

  const fetchMembers = async () => {
    // This endpoint doesn't exist yet, but we'll assume it will.
    const response = await fetch(`/api/teams/${team.id}/members`)
    const data = await response.json()
    if (data.status === 'success') {
      setMembers(data.members)
    }
  }

  const handleAddMember = async () => {
    const response = await fetch('/api/team-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: team.id, user_id: selectedUser }),
    })

    if (response.ok) {
      toast.success('Member added successfully')
      fetchMembers()
    } else {
      toast.error('Failed to add member')
    }
  }

  const handleRemoveMember = async (userId: number) => {
    const response = await fetch('/api/team-members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: team.id, user_id: userId }),
    })

    if (response.ok) {
      toast.success('Member removed successfully')
      fetchMembers()
    } else {
      toast.error('Failed to remove member')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Manage Members</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Members for {team.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Add New Member</h3>
            <div className="flex gap-2 mt-2">
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">Select User</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id.toString()}>
                    {user.employee_name}
                  </option>
                ))}
              </select>
              <Button onClick={handleAddMember}>Add</Button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold">Current Members</h3>
            <ul className="space-y-2 mt-2">
              {members.map((member) => {
                const user = users.find(u => u.id === member.user_id)
                return (
                  <li key={member.user_id} className="flex justify-between items-center p-2 border rounded-md">
                    <span>{user?.employee_name || 'Unknown User'}</span>
                    <Button variant="destructive" size="sm" onClick={() => handleRemoveMember(member.user_id)}>Remove</Button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
