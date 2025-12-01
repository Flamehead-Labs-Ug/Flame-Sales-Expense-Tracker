'use client';

import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExpenseCategoryPreset {
  id: number;
  name: string;
  description?: string;
  sort_order?: number;
}

interface ProjectCategoryPreset {
  id: number;
  name: string;
  description?: string;
  sort_order?: number;
  expense_presets: ExpenseCategoryPreset[];
}

interface ProjectCategoryPresetsPanelProps {
  presets: ProjectCategoryPreset[];
  loading: boolean;
  selectedPresetIds: number[];
  applying: boolean;
  onTogglePreset: (id: number) => void;
  onClearSelection: () => void;
  onUseSelected: () => void;
  onAddCustomCategory?: () => void;
}

export function ProjectCategoryPresetsPanel({
  presets,
  loading,
  selectedPresetIds,
  applying,
  onTogglePreset,
  onClearSelection,
  onUseSelected,
  onAddCustomCategory,
}: ProjectCategoryPresetsPanelProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">Recommended project categories</h3>
        <p className="text-xs text-muted-foreground">
          Tap to select one or more options to quickly add common project and expense categories.
        </p>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading recommended categories...</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {presets.map((preset) => {
            const isSelected = selectedPresetIds.includes(preset.id);
            const hasExtraInfo =
              !!preset.description || (preset.expense_presets && preset.expense_presets.length > 0);

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onTogglePreset(preset.id)}
                className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                    : 'border-border bg-card hover:border-border/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-medium text-foreground truncate">{preset.name}</span>
                    {hasExtraInfo && (
                      <div className="group relative inline-flex">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-primary-foreground bg-primary rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {preset.description && <span>{preset.description}</span>}
                          {preset.expense_presets && preset.expense_presets.length > 0 && (
                            <span>
                              {preset.description && ' '}
                              Includes expense categories like:{' '}
                              {preset.expense_presets
                                .slice(0, 3)
                                .map((e) => e.name)
                                .join(', ')}
                              {preset.expense_presets.length > 3 ? '...' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <span className="text-xs font-semibold text-primary shrink-0">Selected</span>
                  )}
                </div>
              </button>
            );
          })}
          {presets.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground">No recommended project categories available.</div>
          )}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onClearSelection}
          disabled={applying || selectedPresetIds.length === 0}
        >
          Clear Selection
        </Button>
        <Button
          type="button"
          onClick={onUseSelected}
          disabled={applying || selectedPresetIds.length === 0}
        >
          {applying ? 'Applying...' : 'Use Selected'}
        </Button>
        {onAddCustomCategory && (
          <Button type="button" variant="ghost" onClick={onAddCustomCategory}>
            Add custom category
          </Button>
        )}
      </div>
    </div>
  );
}
