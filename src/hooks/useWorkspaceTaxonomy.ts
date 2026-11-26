import { useMemo } from 'react';
import { useSettingsContext } from '@/context/SettingsContext';
import {
  DEFAULT_CATEGORIES,
  categoryOptions,
  labelForColor as resolveColorLabel,
  type ColorLabels,
} from '@/lib/workspace-taxonomy';
import type { TaskColor } from '@/lib/planner/colors';

export type WorkspaceTaxonomy = {
  /** The workspace categories, without the implicit General default. */
  categories: string[];
  /** Every category a picker offers: the workspace list plus General. */
  options: string[];
  /** color key → category name, as stored in the workspace settings. */
  colorLabels: ColorLabels;
  /** The category associated with a color, if any. */
  labelForColor: (color: TaskColor | null | undefined) => string | null;
};

/** Reads the workspace taxonomy (editable categories + label colors). */
export function useWorkspaceTaxonomy(): WorkspaceTaxonomy {
  const { settings } = useSettingsContext();
  const storedCategories = settings.categories;
  const storedColorLabels = settings.colorLabels;

  return useMemo(() => {
    const categories = storedCategories ?? [...DEFAULT_CATEGORIES];
    const colorLabels = storedColorLabels ?? {};

    return {
      categories,
      options: categoryOptions(categories),
      colorLabels,
      labelForColor: (color) => resolveColorLabel(color, colorLabels),
    };
  }, [storedCategories, storedColorLabels]);
}
