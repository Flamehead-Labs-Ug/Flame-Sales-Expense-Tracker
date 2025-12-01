'use client';

import { useState, useEffect, FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogFooter } from '@/components/ui/dialog';

interface Project {
  id: number;
  project_name: string;
}

interface InviteUserFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function InviteUserForm({ onSuccess, onCancel }: InviteUserFormProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('user');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Fetch projects to populate the multi-select
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects');
        const data = await response.json();
        if (data.status === 'success') {
          setProjects(data.projects);
        }
      } catch (error) {
        toast.error('Failed to load projects');
      }
    };
    fetchProjects();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, role, project_ids: selectedProjects }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        toast.success('Invitation sent successfully');
        onSuccess();
      } else {
        toast.error(data.message || 'Failed to send invitation');
      }
    } catch (error) {
      toast.error('Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProjectSelection = (projectId: number) => {
    setSelectedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId) 
        : [...prev, projectId]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground">Email *</label>
        <Input
          type="email"
          placeholder="Enter user's email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Username *</label>
        <Input
          placeholder="Enter a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Role *</label>
        <Select onValueChange={setRole} value={role}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground">Assign to Projects</label>
        <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-2">
          {projects.map(project => (
            <div key={project.id} className="flex items-center">
              <input
                type="checkbox"
                id={`project-${project.id}`}
                checked={selectedProjects.includes(project.id)}
                onChange={() => handleProjectSelection(project.id)}
                className="h-4 w-4 text-primary border-border rounded focus:ring-ring"
              />
              <label htmlFor={`project-${project.id}`} className="ml-2 block text-sm text-foreground">
                {project.project_name}
              </label>
            </div>
          ))}
        </div>
      </div>
      <DialogFooter className='pt-4'>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Send Invitation
        </Button>
      </DialogFooter>
    </form>
  );
}
