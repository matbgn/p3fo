import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettingsContext } from '@/context/SettingsContext';
import { TaskColorPalette } from '@/components/planner/TaskColorPalette';
import {
  DEFAULT_CATEGORIES,
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME_LENGTH,
  colorForCategory,
  isReservedCategoryName,
  isValidCategoryName,
  labelKey,
  normalizeCategoryName,
  sanitizeCategories,
  withCategoryColor,
  withRenamedCategory,
  withoutCategory,
} from '@/lib/workspace-taxonomy';
import type { ColorLabels } from '@/lib/workspace-taxonomy';
import type { TaskColor } from '@/lib/planner/colors';

/**
 * Settings › Workspace › Labels & categories.
 *
 * Categories are the base of the labels: each one is editable, and each can
 * optionally carry a color (preset or free). A color associated with a
 * category shows that name in the color pickers; the others keep their
 * default color name. Everything is stored at the workspace level so all
 * collaborators share the same vocabulary.
 */
export const WorkspaceLabelsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();
  const categories = settings.categories ?? [...DEFAULT_CATEGORIES];
  const colorLabels = settings.colorLabels ?? {};

  const [drafts, setDrafts] = React.useState<Record<number, string>>({});
  const [newName, setNewName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const isDuplicate = (name: string, exceptIndex?: number) => {
    const key = labelKey(name);

    return categories.some(
      (category, index) => index !== exceptIndex && labelKey(category) === key,
    );
  };

  /**
   * The reason a name cannot be saved, or null. Mirrors the rules the
   * persistence adapters apply, so the editor never accepts a name that a
   * save would silently drop.
   */
  const nameProblem = (name: string, exceptIndex?: number): string | null => {
    if (name.length > MAX_CATEGORY_NAME_LENGTH) {
      return t('settings.labels.errorTooLong', { max: MAX_CATEGORY_NAME_LENGTH });
    }

    if (isReservedCategoryName(name)) {
      return t('settings.labels.errorReserved', { name });
    }

    if (!isValidCategoryName(name)) {
      return t('settings.labels.errorInvalidName');
    }

    if (isDuplicate(name, exceptIndex)) {
      return t('settings.labels.errorDuplicate', { name });
    }

    return null;
  };

  const save = (next: { categories?: string[]; colorLabels?: ColorLabels }) => {
    void updateSettings(
      {
        ...(next.categories !== undefined ? { categories: next.categories } : {}),
        ...(next.colorLabels !== undefined ? { colorLabels: next.colorLabels } : {}),
      },
      'global',
    );
  };

  const commitName = (index: number, raw: string) => {
    const previous = categories[index];
    const next = normalizeCategoryName(raw);
    setDrafts((current) => {
      const copy = { ...current };
      delete copy[index];
      return copy;
    });

    if (!next || next === previous) return;

    const problem = nameProblem(next, index);

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    save({
      categories: categories.map((category, at) => (at === index ? next : category)),
      colorLabels: withRenamedCategory(colorLabels, previous, next),
    });
  };

  const addCategory = () => {
    const next = normalizeCategoryName(newName);

    if (!next) return;

    const problem = nameProblem(next);

    if (problem) {
      setError(problem);
      return;
    }

    // The persistence adapters truncate to MAX_CATEGORIES; reject here so the
    // editor never accepts a category the save would silently drop.
    if (categories.length >= MAX_CATEGORIES) {
      setError(t('settings.labels.errorTooMany', { max: MAX_CATEGORIES }));
      return;
    }

    setError(null);
    setNewName('');
    save({ categories: [...categories, next] });
  };

  const removeCategory = (name: string) => {
    setError(null);
    save({
      categories: categories.filter((category) => labelKey(category) !== labelKey(name)),
      colorLabels: withoutCategory(colorLabels, name),
    });
  };

  const setColor = (name: string, color: TaskColor) => {
    setError(null);
    save({
      colorLabels: withCategoryColor(colorLabels, name, color === 'none' ? null : color),
    });
  };

  const resetAll = () => {
    setError(null);
    save({ categories: sanitizeCategories([...DEFAULT_CATEGORIES]), colorLabels: {} });
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{t('settings.labels.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.labels.description')}</p>
      </div>

      <ul className="divide-y rounded-lg border" data-test="workspace-label-list">
        {categories.map((name, index) => {
          const color = colorForCategory(name, colorLabels);

          return (
            <li
              key={`${name}-${index}`}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <TaskColorPalette
                  value={color ?? 'none'}
                  onChange={(next) => setColor(name, next)}
                  colorLabels={colorLabels}
                  size="sm"
                />
                <Input
                  value={drafts[index] ?? name}
                  maxLength={MAX_CATEGORY_NAME_LENGTH}
                  className="h-8 min-w-0 flex-1"
                  aria-label={t('settings.labels.nameLabel')}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [index]: event.target.value }))
                  }
                  onBlur={(event) => commitName(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                      setDrafts((current) => {
                        const copy = { ...current };
                        delete copy[index];
                        return copy;
                      });
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label={t('settings.labels.remove', { name })}
                title={t('settings.labels.remove', { name })}
                onClick={() => removeCategory(name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="new-label-name">{t('settings.labels.addLabel')}</Label>
          <Input
            id="new-label-name"
            value={newName}
            maxLength={MAX_CATEGORY_NAME_LENGTH}
            placeholder={t('settings.labels.namePlaceholder')}
            className="mt-1 h-8"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCategory();
              }
            }}
          />
        </div>
        <Button type="button" size="sm" onClick={addCategory} disabled={!newName.trim()}>
          <Plus className="mr-1 h-4 w-4" />
          {t('settings.labels.add')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={resetAll}
          title={t('settings.labels.resetAllHint')}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          {t('settings.labels.resetAll')}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{t('settings.labels.footnote')}</p>
    </section>
  );
};
