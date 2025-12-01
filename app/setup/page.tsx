'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useFilter } from '@/lib/context/filter-context';
import { Info } from 'lucide-react';
import { ProjectForm } from '@/components/forms/project-form';
import { CycleForm } from '@/components/forms/cycle-form';
import { ProductForm } from '@/components/forms/product-form';
import { OrganizationForm } from '@/components/forms/organization-form';

interface ProjectCategory {
  id: number;
  category_name: string;
  description?: string;
}

interface ExpenseCategory {
  id: number;
  category_name: string;
  description?: string;
  project_category_id?: number;
}

interface Unit {
  id: number;
  unit_name: string;
}

interface VariantType {
  id: number;
  type_name: string;
  units: Unit[];
}

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [createdOrgId, setCreatedOrgId] = useState<number | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null);
  const [createdCycleId, setCreatedCycleId] = useState<number | null>(null);
  const { setSelectedProject, setSelectedCycle, setSelectedOrganization, refreshOrganizations, refreshProjects, refreshCycles, organizations } = useFilter();
  const router = useRouter();

  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>([]);
  const [allExpenseCategories, setAllExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [filteredExpenseCategories, setFilteredExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);



  useEffect(() => {
    const loadData = async () => {
      try {
        const [projCatRes, expCatRes, varTypeRes] = await Promise.all([
          fetch('/api/project-categories'),
          fetch('/api/expense-categories'),
          fetch('/api/variant-types')
        ]);
        const projCatData = await projCatRes.json();
        const expCatData = await expCatRes.json();
        const varTypeData = await varTypeRes.json();

        if (projCatData.status === 'success') setProjectCategories(projCatData.categories || []);
        if (expCatData.status === 'success') {
          setAllExpenseCategories(expCatData.categories || []);
          setFilteredExpenseCategories(expCatData.categories || []);
        }
        if (varTypeData.status === 'success') setVariantTypes(varTypeData.variantTypes || []);
      } catch (error) {
        console.error('Failed to load initial setup data:', error);
        toast.error('Failed to load setup data.');
      }
    };
    loadData();
  }, []);




  const handleOrgSubmit = (organization: any) => {
    const newOrgId = organization.id;
    setCreatedOrgId(newOrgId);
    setSelectedOrganization(newOrgId.toString());
    refreshOrganizations();
    toast.success('Organization created! Now create a project.');
    setCurrentStep(2);
  };

  const handleProjectSubmit = (project: any) => {
    const newProjectId = project.id;
    setCreatedProjectId(newProjectId);
    setSelectedProject(newProjectId.toString());
    // Ensure FilterContext.projects includes this new project (with its currency)
    refreshProjects();
    toast.success('Project created! Now create a cycle.');
    setCurrentStep(3);
  };

  const handleCycleSubmit = (cycle: any) => {
    const newCycleId = cycle.id;
    setCreatedCycleId(newCycleId);
    setSelectedCycle(newCycleId.toString());
    // Ensure FilterContext.cycles includes this new cycle so it appears in the nav dropdown
    refreshCycles();
    toast.success('Cycle created! Now add your first product.');
    setCurrentStep(4);
  };

  const handleProductSubmit = (product: any) => {
    toast.success('Product created successfully!');
    setTimeout(() => {
      router.push('/');
    }, 1000);
    toast.success('Setup complete! Welcome to Flame Expense Tracker.');
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div
        className={`${currentStep === 4 ? 'max-w-5xl' : 'max-w-md'} w-full space-y-8`}
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome to Flame Expense Tracker</h1>
          <p className="mt-2 text-muted-foreground">Let's set up your workspace</p>
        </div>

        {currentStep === 1 && (
          <div className="bg-card p-6 rounded-lg shadow border border-border">
            <h2 className="text-xl font-semibold mb-4">Step 1: Create Your Organization</h2>
            <OrganizationForm onSuccess={handleOrgSubmit} />
          </div>
        )}

        {currentStep === 2 && (
          <div className="bg-card p-6 rounded-lg shadow border border-border">
            <h2 className="text-xl font-semibold mb-4">Step 2: Create Your First Project</h2>
            <ProjectForm
              editingProject={null}
              selectedOrganizationId={createdOrgId?.toString()}
              organizations={organizations}
              projectCategories={projectCategories}
              setProjectCategories={setProjectCategories}
              expenseCategories={allExpenseCategories}
              setExpenseCategories={setAllExpenseCategories}
              onSuccess={handleProjectSubmit}
              onCancel={() => setCurrentStep(1)}
            />
          </div>
        )}

        {currentStep === 3 && (
          <div className="bg-card p-6 rounded-lg shadow border border-border">
            <h2 className="text-xl font-semibold mb-4">Step 3: Create Your First Cycle</h2>
            <CycleForm
              projectId={createdProjectId!}
              onSuccess={handleCycleSubmit}
              onCancel={() => setCurrentStep(2)}
            />
          </div>
        )}

        {currentStep === 4 && (
          <div className="bg-card p-6 rounded-lg shadow border border-border">
            <h2 className="text-xl font-semibold mb-4">Step 4: Add Your First Product</h2>
            <ProductForm
              editingProduct={null}
              selectedProject={createdProjectId?.toString()}
              selectedCycle={createdCycleId?.toString()}
              projects={[]}
              onSuccess={handleProductSubmit}
              onCancel={() => setCurrentStep(3)}
            />
          </div>
        )}

        <div className="flex justify-center space-x-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`w-3 h-3 rounded-full ${
                step <= currentStep ? 'bg-blue-600' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
