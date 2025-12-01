'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Eye, Image as ImageIcon, Scan, Search as SearchIcon } from 'lucide-react';
import { useFilter } from '@/lib/context/filter-context';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

interface Receipt {
  id: number;
  expense_id?: number;
  file_path?: string;
  upload_date: string;
  raw_text?: string;
  structured_data?: {
    vendor?: { name?: string };
    details?: { receipt_number?: string; date?: string };
    summary?: { total_due?: number };
  };
}

function ReceiptsPageContent() {
  const { selectedProject, selectedCycle, projects, cycles, setSelectedProject, setSelectedCycle } = useFilter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, [selectedProject, selectedCycle]);

  const loadData = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/receipts', window.location.origin);
      if (selectedProject) url.searchParams.set('project_id', selectedProject);
      if (selectedCycle) url.searchParams.set('cycle_id', selectedCycle);
      if (searchTerm) url.searchParams.set('search', searchTerm);

      const response = await fetch(url.toString());
      const data = await response.json();
      if (data.status === 'success') {
        setReceipts(data.receipts || []);
      } else {
        toast.error(data.message || 'Failed to load receipts');
      }
    } catch (error) {
      toast.error('Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadData();
  };

  const handleViewImage = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setIsImageModalOpen(true);
  };

  const handleViewOcr = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setIsOcrModalOpen(true);
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Receipts</h1>
        <div className="text-sm text-muted-foreground">
          View your uploaded receipts. Add new receipts from the Expenses page.
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end mt-2">
        <div>
          <label className="block text-sm font-medium text-foreground">Project</label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="mt-1 w-48 px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id.toString()}>
                {project.project_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Cycle</label>
          <select
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className="mt-1 w-48 px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            disabled={!selectedProject}
          >
            <option value="">All cycles</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id.toString()}>
                {cycle.cycle_name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <Input
            placeholder="Search receipts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <Button type="button" onClick={handleSearch}>
            <SearchIcon className="w-4 h-4 mr-2" />
            Search
          </Button>
        </div>
      </div>

      <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {receipts.map((receipt) => (
            <Card key={receipt.id} className="w-full">
              <CardHeader className="px-4 py-3 border-b border-border">
                <div className="flex flex-col">
                  <CardTitle className="text-sm font-semibold">
                    {receipt.structured_data?.details?.receipt_number || `Receipt #${receipt.id}`}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {receipt.structured_data?.vendor?.name || 'Unknown Vendor'}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="text-2xl font-bold text-green-600">
                  ${(receipt.structured_data?.summary?.total_due ?? 0).toLocaleString()}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    {new Date(receipt.structured_data?.details?.date || receipt.upload_date).toLocaleDateString()}
                  </span>
                  {receipt.file_path && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                      <ImageIcon className="w-3 h-3 mr-1" /> Has Image
                    </span>
                  )}
                </div>
              </CardContent>
              <CardFooter className="px-4 pb-4 pt-0 flex items-center gap-2">
                {receipt.file_path && (
                  <Button size="sm" variant="outline" onClick={() => handleViewImage(receipt)}>
                    <Eye className="w-4 h-4 mr-2" />
                    View Image
                  </Button>
                )}
                {receipt.raw_text && (
                  <Button size="sm" variant="outline" onClick={() => handleViewOcr(receipt)}>
                    <Scan className="w-4 h-4 mr-2" />
                    View OCR Data
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
          {receipts.length === 0 && (
            <div className="col-span-full">
              <div className="p-8 bg-card rounded-lg border border-border text-center text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
                <p>No receipts found. Upload receipts from the Expenses page to see them here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Receipt Image - {selectedReceipt?.structured_data?.details?.receipt_number || `Receipt #${selectedReceipt?.id}`}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {selectedReceipt?.file_path ? (
              <div className="flex justify-center">
                <img
                  src={selectedReceipt.file_path}
                  alt="Receipt"
                  className="max-w-full max-h-96 object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <ImageIcon className="w-12 h-12 mx-auto mb-4" />
                <p>No image available for this receipt</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setIsImageModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOcrModalOpen} onOpenChange={setIsOcrModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>OCR Data for Receipt #{selectedReceipt?.id}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 max-h-[70vh] overflow-y-auto">
            <div>
              <h3 className="font-semibold mb-2">Raw Text</h3>
              <pre className="text-xs bg-muted p-2 rounded-md whitespace-pre-wrap font-mono">
                {selectedReceipt?.raw_text || 'No raw text available.'}
              </pre>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Structured JSON</h3>
              <pre className="text-xs bg-muted p-2 rounded-md whitespace-pre-wrap font-mono">
                {JSON.stringify(selectedReceipt?.structured_data, null, 2) || 'No structured data available.'}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setIsOcrModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AuthGuard>
  );
}

export default function ReceiptsPage() {
  return <ReceiptsPageContent />
}