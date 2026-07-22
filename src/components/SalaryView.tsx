import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SalaryBoardEntity,
  SalaryBudgetScenario,
  SalaryConfig,
  SalaryDimension,
  SalaryEmployee,
  SalaryEmployeeLevel,
  EmployerAdjustment,
} from '@/lib/persistence-types';
import { usePersistence } from '@/hooks/usePersistence';
import { useToast } from '@/hooks/use-toast';
import { doc, isCollaborationEnabled, ySalaryState } from '@/lib/collaboration';
import { useUsersContext } from '@/context/UsersContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Plus,
  Trash2,
  Settings2,
  Users,
  Layers,
  Coins,
  Pencil,
  Save,
  X,
  Calculator,
  Copy,
  Columns2,
  Maximize2,
  RotateCcw,
  Eye,
  EyeOff,
  Clock,
  TrendingUp,
  PieChart,
  UserPlus,
} from 'lucide-react';
import {
  computeSalary,
  computeAllSalaries,
  aggregateSalaries,
  computeBudget,
  simulateSalary,
  buildProjection,
  formatCurrency,
  createDefaultSalaryBoard,
  roundToStep,
  roundToNickel,
} from '@/lib/salary-calc';

interface SalaryViewProps {
  embedded?: boolean;
  hideHeaderActions?: boolean;
}

const newId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ---------- Config editor ----------
const ConfigEditor: React.FC<{
  config: SalaryConfig;
  onChange: (next: SalaryConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const update = <K extends keyof SalaryConfig>(key: K, value: SalaryConfig[K]) =>
    onChange({ ...config, [key]: value });

  const [bracketsText, setBracketsText] = useState(config.ageBrackets.join(', '));
  useEffect(() => {
    setBracketsText(config.ageBrackets.join(', '));
  }, [config.ageBrackets]);

  const commitBrackets = () => {
    const parsed = bracketsText
      .split(/[,;\s]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    update('ageBrackets', Array.from(new Set(parsed)));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="space-y-1">
        <Label htmlFor="cfg-hourly">{t('salary.config.indexHourlyWage')}</Label>
        <Input
          id="cfg-hourly"
          type="number"
          step="0.01"
          value={config.indexHourlyWage}
          onChange={e => update('indexHourlyWage', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-hours">{t('salary.config.hoursPerWeek')}</Label>
        <Input
          id="cfg-hours"
          type="number"
          value={config.hoursPerWeek}
          onChange={e => update('hoursPerWeek', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-weeks">{t('salary.config.weeksPerMonth')}</Label>
        <Input
          id="cfg-weeks"
          type="number"
          step="0.01"
          value={config.weeksPerMonth}
          onChange={e => update('weeksPerMonth', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-seniority">{t('salary.config.seniorityIncrease')}</Label>
        <Input
          id="cfg-seniority"
          type="number"
          step="0.001"
          value={config.seniorityIncrease}
          onChange={e => update('seniorityIncrease', parseFloat(e.target.value) || 0)}
        />
        <p className="text-xs text-muted-foreground">{t('salary.config.seniorityIncreaseHelp')}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-age">{t('salary.config.ageIncrease')}</Label>
        <Input
          id="cfg-age"
          type="number"
          step="0.001"
          value={config.ageIncrease}
          onChange={e => update('ageIncrease', parseFloat(e.target.value) || 0)}
        />
        <p className="text-xs text-muted-foreground">{t('salary.config.ageIncreaseHelp')}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-brackets">{t('salary.config.ageBrackets')}</Label>
        <Input
          id="cfg-brackets"
          value={bracketsText}
          onChange={e => setBracketsText(e.target.value)}
          onBlur={commitBrackets}
          placeholder={t('salary.config.ageBracketsPlaceholder')}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-charges">{t('salary.config.socialChargesRate')}</Label>
        <Input
          id="cfg-charges"
          type="number"
          step="0.0001"
          value={config.socialChargesRate}
          onChange={e => update('socialChargesRate', parseFloat(e.target.value) || 0)}
        />
        <p className="text-xs text-muted-foreground">{t('salary.config.socialChargesHelp')}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-expense">{t('salary.config.expenseFactor')}</Label>
        <Input
          id="cfg-expense"
          type="number"
          step="0.01"
          value={config.expenseFactor ?? 1}
          onChange={e => update('expenseFactor', parseFloat(e.target.value) || 1)}
        />
        <p className="text-xs text-muted-foreground">
          {t('salary.config.expenseFactorHelp')}
        </p>
        <p className="text-xs text-muted-foreground italic">
          {t('salary.config.expenseFactorNote')}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-round">{t('salary.config.roundingStep')}</Label>
        <Input
          id="cfg-round"
          type="number"
          value={config.roundingStep}
          onChange={e => update('roundingStep', parseFloat(e.target.value) || 1)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-currency">{t('salary.config.currency')}</Label>
        <Input
          id="cfg-currency"
          value={config.currency}
          onChange={e => update('currency', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-hours-day">{t('salary.config.hoursPerDay')}</Label>
        <Input
          id="cfg-hours-day"
          type="number"
          value={config.hoursPerDay}
          onChange={e => update('hoursPerDay', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cfg-days-week">{t('salary.config.daysPerWeek')}</Label>
        <Input
          id="cfg-days-week"
          type="number"
          value={config.daysPerWeek}
          onChange={e => update('daysPerWeek', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="flex items-center space-x-2 pt-6">
        <Switch
          id="cfg-13th"
          checked={config.include13thSalary}
          onCheckedChange={v => update('include13thSalary', v)}
        />
        <Label htmlFor="cfg-13th">{t('salary.config.include13th')}</Label>
      </div>
    </div>
  );
};

// ---------- Dimension editor ----------
const DimensionEditor: React.FC<{
  dimensions: SalaryDimension[];
  onChange: (next: SalaryDimension[]) => void;
}> = ({ dimensions, onChange }) => {
  const { t } = useTranslation();
  const updateDimension = (id: string, patch: Partial<SalaryDimension>) =>
    onChange(dimensions.map(d => (d.id === id ? { ...d, ...patch } : d)));

  const removeDimension = (id: string) =>
    onChange(dimensions.filter(d => d.id !== id));

  const addDimension = () => {
    const next: SalaryDimension = {
      id: newId(),
      name: t('salary.dimension.defaultName'),
      stepValue: 0,
      maxLevel: 4,
      affectsSalary: true,
      levelDescriptions: [],
      color: '#A78BFA',
    };
    onChange([...dimensions, next]);
  };

  return (
    <div className="space-y-3">
      {dimensions.map(dim => (
        <Card key={dim.id} className="border">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>{t('salary.dimension.name')}</Label>
                <Input
                  value={dim.name}
                  onChange={e => updateDimension(dim.id, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('salary.dimension.maxLevel')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={dim.maxLevel}
                  onChange={e => updateDimension(dim.id, { maxLevel: Math.max(0, parseInt(e.target.value) || 0) })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('salary.dimension.stepValue')}</Label>
                <Input
                  type="number"
                  step="1"
                  value={dim.stepValue}
                  onChange={e => updateDimension(dim.id, { stepValue: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id={`dim-affects-${dim.id}`}
                checked={dim.affectsSalary !== false}
                onCheckedChange={v => updateDimension(dim.id, { affectsSalary: v })}
              />
              <Label htmlFor={`dim-affects-${dim.id}`}>{t('salary.dimension.affectsSalary')}</Label>
              <Input
                type="color"
                value={dim.color ?? '#A78BFA'}
                onChange={e => updateDimension(dim.id, { color: e.target.value })}
                className="w-12 h-8 p-1 ml-auto"
                title={t('salary.dimension.color')}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeDimension(dim.id)}
                title={t('salary.dimension.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            {dim.levelDescriptions && dim.levelDescriptions.length > 0 && (
              <Accordion type="single" collapsible>
                <AccordionItem value={`desc-${dim.id}`}>
                  <AccordionTrigger className="text-xs">
                    {t('salary.dimension.levelDescriptions', { n: dim.levelDescriptions.length })}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {dim.levelDescriptions.slice(0, dim.maxLevel + 1).map((desc, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-xs text-muted-foreground w-12 pt-2">N{i}</span>
                          <Input
                            value={desc}
                            onChange={e => {
                              const next = [...(dim.levelDescriptions ?? [])];
                              next[i] = e.target.value;
                              updateDimension(dim.id, { levelDescriptions: next });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addDimension}>
        <Plus className="w-4 h-4 mr-1" /> {t('salary.dimension.add')}
      </Button>
    </div>
  );
};

// ---------- Employee editor dialog ----------
const EmployeeDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: SalaryEmployee | null;
  dimensions: SalaryDimension[];
  onSave: (emp: SalaryEmployee) => void;
}> = ({ open, onOpenChange, employee, dimensions, onSave }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SalaryEmployee>(() => employee ?? emptyEmployee(t('salary.employee.defaultAdjustmentLabel')));

  useEffect(() => {
    setDraft(employee ?? emptyEmployee(t('salary.employee.defaultAdjustmentLabel')));
  }, [employee, open, t]);

  const setLevel = (dimId: string, level: number) => {
    const others = draft.levels.filter(l => l.dimensionId !== dimId);
    setDraft({ ...draft, levels: [...others, { dimensionId: dimId, level }] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? t('salary.employee.editTitle') : t('salary.employee.addTitle')}</DialogTitle>
          <DialogDescription>
            {t('salary.employee.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="emp-name">{t('salary.employee.name')}</Label>
              <Input
                id="emp-name"
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-workload">{t('salary.employee.workload')}</Label>
              <Input
                id="emp-workload"
                type="number"
                min={0}
                max={100}
                value={draft.workload}
                onChange={e => setDraft({ ...draft, workload: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-age">{t('salary.employee.age')}</Label>
              <Input
                id="emp-age"
                type="number"
                value={draft.age}
                onChange={e => setDraft({ ...draft, age: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emp-seniority">{t('salary.employee.seniority')}</Label>
              <Input
                id="emp-seniority"
                type="number"
                min={0}
                value={draft.seniority}
                onChange={e => setDraft({ ...draft, seniority: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Employer adjustments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('salary.employee.employerAdjustments')}</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft({
                  ...draft,
                  employerAdjustments: [...(draft.employerAdjustments ?? []), { id: newId(), label: t('salary.employee.defaultAdjustmentLabel'), amount: 0, frequency: 'monthly' }],
                })}
              >
                <Plus className="w-3 h-3 mr-1" /> {t('salary.employee.addAdjustment')}
              </Button>
            </div>
            {(draft.employerAdjustments ?? []).map((adj, i) => (
              <div key={adj.id} className="flex gap-2 items-center">
                <Input
                  value={adj.label}
                  onChange={e => {
                    const next = [...(draft.employerAdjustments ?? [])];
                    next[i] = { ...adj, label: e.target.value };
                    setDraft({ ...draft, employerAdjustments: next });
                  }}
                  placeholder={t('salary.employee.adjustmentLabelPlaceholder')}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={adj.amount}
                  onChange={e => {
                    const next = [...(draft.employerAdjustments ?? [])];
                    next[i] = { ...adj, amount: parseFloat(e.target.value) || 0 };
                    setDraft({ ...draft, employerAdjustments: next });
                  }}
                  className="w-28 text-right"
                />
                <Select
                  value={adj.frequency ?? 'monthly'}
                  onValueChange={v => {
                    const next = [...(draft.employerAdjustments ?? [])];
                    next[i] = { ...adj, frequency: v as 'monthly' | 'semesterly' | 'annually' };
                    setDraft({ ...draft, employerAdjustments: next });
                  }}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t('salary.frequency.monthly')}</SelectItem>
                    <SelectItem value="semesterly">{t('salary.frequency.semesterly')}</SelectItem>
                    <SelectItem value="annually">{t('salary.frequency.annually')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft({
                    ...draft,
                    employerAdjustments: (draft.employerAdjustments ?? []).filter((_, idx) => idx !== i),
                  })}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="emp-comment">{t('salary.employee.comment')}</Label>
            <Input
              id="emp-comment"
              value={draft.comment ?? ''}
              onChange={e => setDraft({ ...draft, comment: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('salary.employee.determinants')}</Label>
            <div className="space-y-2">
              {dimensions.map(dim => {
                const level = draft.levels.find(l => l.dimensionId === dim.id)?.level ?? 0;
                return (
                  <div key={dim.id} className="flex flex-wrap items-center gap-3">
                    <span
                      className="text-sm font-medium w-40 truncate"
                      style={{ color: dim.color }}
                      title={dim.name}
                    >
                      {dim.name}
                    </span>
                    <Select
                      value={String(level)}
                      onValueChange={v => setLevel(dim.id, parseInt(v, 10))}
                    >
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: dim.maxLevel + 1 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>{t('salary.employee.levelN', { i })}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dim.levelDescriptions?.[level] && (
                      <span className="text-xs text-muted-foreground italic flex-1 min-w-0 truncate">
                        {dim.levelDescriptions[level]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-1" /> {t('salary.action.cancel')}
          </Button>
          <Button onClick={() => { onSave(draft); onOpenChange(false); }}>
            <Save className="w-4 h-4 mr-1" /> {t('salary.action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const emptyEmployee = (adjustmentLabel: string): SalaryEmployee => ({
  id: newId(),
  name: '',
  workload: 100,
  age: 25,
  seniority: 0,
  levels: [],
  employerAdjustments: [{ id: newId(), label: adjustmentLabel, amount: 0, frequency: 'monthly' }],
  comment: '',
});

// ---------- Main view ----------
export const SalaryView: React.FC<SalaryViewProps> = () => {
  const { t } = useTranslation();
  const persistence = usePersistence();
  const { toast } = useToast();
  const { users } = useUsersContext();
  const [board, setBoard] = useState<SalaryBoardEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [dimensionsOpen, setDimensionsOpen] = useState(false);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<SalaryEmployee | null>(null);
  const [compactView, setCompactView] = useState(true);

  // Load
  useEffect(() => {
    const load = async () => {
      try {
        let saved = await persistence.getSalaryBoardState();
        if (!saved) {
          saved = createDefaultSalaryBoard();
          await persistence.updateSalaryBoardState(saved);
        }
        // Migrate old configs that may be missing newer fields
        if (saved.config.expenseFactor === undefined) {
          const oldRate = (saved.config as unknown as Record<string, unknown>).employerCostRate;
          saved = {
            ...saved,
            config: {
              ...saved.config,
              expenseFactor: typeof oldRate === 'number' ? 1 + oldRate : 1.80,
            },
          };
        }
        if (!saved.budget) {
          saved = { ...saved, budget: createDefaultSalaryBoard().budget };
        }
        // Migrate old manualAdjustment → employerAdjustments
        saved = {
          ...saved,
          employees: saved.employees.map(e => {
            const oldAdj = (e as unknown as Record<string, unknown>).manualAdjustment;
            if (oldAdj !== undefined && !e.employerAdjustments) {
              return { ...e, employerAdjustments: [{ id: newId(), label: t('salary.employee.defaultAdjustmentLabel'), amount: oldAdj as number, frequency: 'monthly' }] };
            }
            // Ensure all adjustments have a frequency
            if (e.employerAdjustments?.some(a => !a.frequency)) {
              return { ...e, employerAdjustments: e.employerAdjustments.map(a => ({ ...a, frequency: a.frequency ?? 'monthly' })) };
            }
            return e;
          }),
        };
        setBoard(saved);

        // Sync to Yjs if collaboration is enabled
        if (isCollaborationEnabled() && ySalaryState.size === 0) {
          ySalaryState.set('board', saved);
        }
      } catch (err) {
        console.error('Error loading salary board:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [persistence, t]);

  // Track our own writes to ignore Yjs echoes
  const lastWrittenUpdatedAt = React.useRef<string | null>(null);

  // Yjs observer — replicate changes from other clients
  useEffect(() => {
    if (!isCollaborationEnabled()) return;

    const observer = () => {
      const remoteBoard = ySalaryState.get('board') as SalaryBoardEntity | undefined;
      if (remoteBoard) {
        setBoard(prev => {
          // Ignore our own echo
          if (lastWrittenUpdatedAt.current && remoteBoard.updatedAt === lastWrittenUpdatedAt.current) return prev;
          // Only update if the remote state is different
          if (prev?.updatedAt === remoteBoard.updatedAt) return prev;
          return remoteBoard;
        });
      }
    };

    ySalaryState.observe(observer);
    return () => {
      ySalaryState.unobserve(observer);
    };
  }, []);

  const save = useCallback(async (next: SalaryBoardEntity) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    lastWrittenUpdatedAt.current = stamped.updatedAt;
    setBoard(stamped);
    // Sync to Yjs for cross-client replication
    if (isCollaborationEnabled()) {
      doc.transact(() => {
        ySalaryState.set('board', stamped);
      });
    }
    try {
      await persistence.updateSalaryBoardState(stamped);
    } catch (err) {
      console.error('Error saving salary board:', err);
    }
  }, [persistence]);

  const rows = useMemo(() => (board ? computeAllSalaries(board) : []), [board]);
  const totals = useMemo(() => (board ? aggregateSalaries(board) : null), [board]);

  const updateConfig = (config: SalaryConfig) => board && save({ ...board, config });
  const updateDimensions = (dimensions: SalaryDimension[]) => board && save({ ...board, dimensions });

  const addEmployee = () => {
    setEditingEmployee(null);
    setEmployeeDialogOpen(true);
  };
  const editEmployee = (emp: SalaryEmployee) => {
    setEditingEmployee(emp);
    setEmployeeDialogOpen(true);
  };
  const saveEmployee = (emp: SalaryEmployee) => {
    if (!board) return;
    const exists = board.employees.some(e => e.id === emp.id);
    const employees = exists
      ? board.employees.map(e => (e.id === emp.id ? emp : e))
      : [...board.employees, emp];
    save({ ...board, employees });
  };
  const removeEmployee = (id: string) => {
    if (!board) return;
    save({ ...board, employees: board.employees.filter(e => e.id !== id) });
  };

  const seedFromUsers = () => {
    if (!board) return;
    const existingNames = new Set(board.employees.map(e => e.name.toLowerCase()));
    const toAdd: SalaryEmployee[] = users
      .filter(u => u.username && !existingNames.has(u.username.toLowerCase()))
      .map(u => ({
        id: newId(),
        name: u.username,
        // Reuse the user's existing workload (stored as 0..100). Fall back to 100.
        workload: u.workload && u.workload > 0 ? u.workload : 100,
        age: 25,
        seniority: 0,
        levels: [],
        employerAdjustments: [{ id: newId(), label: t('salary.employee.defaultAdjustmentLabel'), amount: 0, frequency: 'monthly' }],
        comment: t('salary.employee.linkedUserComment', { name: u.username }),
      }));
    if (toAdd.length === 0) return;
    save({ ...board, employees: [...board.employees, ...toAdd] });
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">{t('salary.loading')}</div>;
  }
  if (!board) {
    return <div className="p-6 text-muted-foreground">{t('salary.loadError')}</div>;
  }

  const currency = board.config.currency;

  return (
    <div className="h-full overflow-y-auto px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {t('salary.config.indexHourlyWage')} {formatCurrency(board.config.indexHourlyWage, currency)} ·
            {' '}{board.config.hoursPerWeek}h/sem ·
            charges {((board.config.socialChargesRate || 0) * 100).toFixed(2)}% ·
            {board.config.include13thSalary ? ` ${t('salary.config.salaries13')}` : ` ${t('salary.config.salaries12')}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={configOpen} onOpenChange={setConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="w-4 h-4 mr-1" /> {t('salary.action.settings')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('salary.config.dialogTitle')}</DialogTitle>
                <DialogDescription>
                  {t('salary.config.dialogDescription')}
                </DialogDescription>
              </DialogHeader>
              <ConfigEditor config={board.config} onChange={updateConfig} />
              <DialogFooter>
                <Button onClick={() => setConfigOpen(false)}>{t('salary.action.close')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dimensionsOpen} onOpenChange={setDimensionsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Layers className="w-4 h-4 mr-1" /> {t('salary.action.dimensions')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('salary.dimensions.dialogTitle')}</DialogTitle>
                <DialogDescription>
                  {t('salary.dimensions.dialogDescription')}
                </DialogDescription>
              </DialogHeader>
              <DimensionEditor dimensions={board.dimensions} onChange={updateDimensions} />
              <DialogFooter>
                <Button onClick={() => setDimensionsOpen(false)}>{t('salary.action.close')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button size="sm" variant="outline" onClick={seedFromUsers}>
            <UserPlus className="w-4 h-4 mr-1" /> {t('salary.action.linkUsers')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCompactView(v => !v)}>
            {compactView ? <Maximize2 className="w-4 h-4 mr-1" /> : <Columns2 className="w-4 h-4 mr-1" />}
            {compactView ? t('salary.action.allColumns') : t('salary.action.compactView')}
          </Button>
          <Button size="sm" onClick={addEmployee}>
            <Plus className="w-4 h-4 mr-1" /> {t('salary.action.addEmployee')}
          </Button>
        </div>
      </div>

      {/* Totals */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard label={t('salary.metric.headcount')} value={String(totals.headcount)} />
          <MetricCard label={t('salary.metric.fte')} value={totals.fte.toFixed(2)} />
          <MetricCard label={t('salary.metric.grossMonthly')} value={formatCurrency(totals.totalGrossMonthly, currency)} />
          <MetricCard label={t('salary.metric.grossAnnual')} value={formatCurrency(totals.totalGrossAnnual, currency)} />
          <MetricCard label={t('salary.metric.netApprox')} value={formatCurrency(totals.totalNetMonthlyWith13, currency)} />
          <MetricCard
            label={t('salary.metric.employerCostAnnual')}
            value={formatCurrency(totals.totalEmployerCostAnnual, currency)}
          />
        </div>
      )}

      {/* Employees table */}
      <Card className="border">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-4 h-4" /> {t('salary.employees.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('salary.table.name')}</TableHead>
                <TableHead className="text-right">{t('salary.table.workload')}</TableHead>
                {!compactView && <TableHead className="text-right">{t('salary.table.age')}</TableHead>}
                {!compactView && <TableHead className="text-right">{t('salary.table.seniority')}</TableHead>}
                {board.dimensions.map(d => (
                  <TableHead key={d.id} className="text-center" style={{ color: d.color }}>
                    {d.name}
                  </TableHead>
                ))}
                <TableHead className="text-right bg-muted/50">{t('salary.table.hourlyRate')}</TableHead>
                {!compactView && <TableHead className="text-right">{t('salary.table.grossMonthly100')}</TableHead>}
                {!compactView && <TableHead className="text-right">{t('salary.table.grossAnnual100')}</TableHead>}
                <TableHead className="text-right bg-muted/50">{t('salary.table.adjustmentsMonthly')}</TableHead>
                {!compactView && <TableHead className="text-right">{t('salary.table.grossMonthly')}</TableHead>}
                {!compactView && <TableHead className="text-right">{t('salary.table.grossMonthly13')}</TableHead>}
                <TableHead className="text-right bg-muted/50">{t('salary.table.grossMonthly13Adj')}</TableHead>
                {!compactView && <TableHead className="text-right">{t('salary.table.grossAnnualAdj')}</TableHead>}
                {!compactView && <TableHead className="text-right">{t('salary.table.net')}</TableHead>}
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={compactView ? 7 + board.dimensions.length : 14 + board.dimensions.length} className="text-center text-muted-foreground italic py-6">
                    {t('salary.table.empty')}
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ employee, computation }) => (
                <TableRow key={employee.id} onDoubleClick={() => editEmployee(employee)} className="cursor-pointer">
                  <TableCell className="font-medium">
                    {employee.name || <span className="italic text-muted-foreground">{t('salary.employee.unnamed')}</span>}
                  </TableCell>
                  <TableCell className="text-right">{employee.workload}</TableCell>
                  {!compactView && <TableCell className="text-right">{employee.age}</TableCell>}
                  {!compactView && <TableCell className="text-right">{employee.seniority}</TableCell>}
                  {board.dimensions.map(dim => {
                    const level = employee.levels.find(l => l.dimensionId === dim.id)?.level ?? 0;
                    return (
                      <TableCell key={dim.id} className="text-center" style={{ color: dim.color }}>
                        {level}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right bg-muted/30">{formatCurrency(computation.gross100Hourly, currency)}</TableCell>
                  {!compactView && <TableCell className="text-right">{formatCurrency(computation.gross100, currency)}</TableCell>}
                  {!compactView && <TableCell className="text-right">{formatCurrency(computation.gross100Annual, currency)}</TableCell>}
                  <TableCell className="text-right bg-muted/30">{(() => {
                    const adjs = employee.employerAdjustments ?? [];
                    const monthlySum = adjs.reduce((s, a) => {
                      const m = a.frequency === 'semesterly' ? (a.amount || 0) / 6
                        : a.frequency === 'annually' ? (a.amount || 0) / 12
                        : (a.amount || 0);
                      return s + m;
                    }, 0);
                    if (monthlySum === 0) return <span className="text-muted-foreground">—</span>;
                    return <span title={adjs.map(a => `${a.label}: ${formatCurrency(a.amount, currency)} (${a.frequency ?? 'monthly'})`).join('\n')}>{formatCurrency(monthlySum, currency)}</span>;
                  })()}</TableCell>
                  {!compactView && <TableCell className="text-right">{formatCurrency(computation.grossMonthlyPure, currency)}{employee.workload !== 100 && <span className="text-xs text-muted-foreground ml-1">({employee.workload}%)</span>}</TableCell>}
                  {!compactView && <TableCell className="text-right">{formatCurrency(computation.grossMonthlyWith13, currency)}{employee.workload !== 100 && <span className="text-xs text-muted-foreground ml-1">({employee.workload}%)</span>}</TableCell>}
                  <TableCell className="text-right bg-muted/30 font-medium">{formatCurrency(computation.grossMonthlyWith13AndAdjustments, currency)}{employee.workload !== 100 && <span className="text-xs text-muted-foreground ml-1">({employee.workload}%)</span>}</TableCell>
                  {!compactView && <TableCell className="text-right">{formatCurrency(computation.grossAnnualWithout13, currency)}{employee.workload !== 100 && <span className="text-xs text-muted-foreground ml-1">({employee.workload}%)</span>}</TableCell>}
                  {!compactView && <TableCell className="text-right">{formatCurrency(computation.netMonthlyWith13, currency)}</TableCell>}
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => editEmployee(employee)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeEmployee(employee.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {totals && rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold" colSpan={compactView ? 2 + board.dimensions.length : 4 + board.dimensions.length}>
                    {t('salary.table.totals', { n: totals.fte.toFixed(2) })}
                  </TableCell>
                  <TableCell className="text-right font-semibold bg-muted/30">—</TableCell>
                  {!compactView && <TableCell className="text-right font-semibold">—</TableCell>}
                  {!compactView && <TableCell className="text-right font-semibold">—</TableCell>}
                  <TableCell className="text-right font-semibold bg-muted/30">—</TableCell>
                  {!compactView && <TableCell className="text-right font-semibold">—</TableCell>}
                  {!compactView && <TableCell className="text-right font-semibold">—</TableCell>}
                  <TableCell className="text-right font-semibold bg-muted/30">{formatCurrency(totals.totalGrossMonthlyWith13AndAdjustments, currency)}</TableCell>
                  {!compactView && <TableCell className="text-right font-semibold">{formatCurrency(totals.totalGrossAnnual, currency)}</TableCell>}
                  {!compactView && <TableCell className="text-right font-semibold">{formatCurrency(totals.totalNetMonthlyWith13, currency)}</TableCell>}
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      {/* Budget + Simulator tabs */}
      <Tabs defaultValue="budget" className="w-full">
        <TabsList>
          <TabsTrigger value="budget"><PieChart className="w-4 h-4 mr-1" />{t('salary.tab.budget')}</TabsTrigger>
          <TabsTrigger value="simulator"><Calculator className="w-4 h-4 mr-1" />{t('salary.tab.simulator')}</TabsTrigger>
          <TabsTrigger value="team"><Users className="w-4 h-4 mr-1" />{t('salary.tab.teamSimulator')}</TabsTrigger>
          <TabsTrigger value="hourly"><Clock className="w-4 h-4 mr-1" />{t('salary.tab.hourlyRate')}</TabsTrigger>
        </TabsList>

        <TabsContent value="budget">
          <BudgetPanel board={board} onChange={save} />
        </TabsContent>

        <TabsContent value="simulator">
          <SimulatorPanel board={board} />
        </TabsContent>

        <TabsContent value="team">
          <TeamSimulatorPanel board={board} />
        </TabsContent>

        <TabsContent value="hourly">
          <HourlyRatePanel board={board} onSave={save} />
        </TabsContent>
      </Tabs>

      {/* Formula reference */}
      <Card className="border bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('salary.legend.title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.base') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.determinants') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.gross100') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.grossAnnual100') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.hourly') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.monthlyWith13') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.annualGross') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.monthly') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.net') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.employerCost') }} />
          <p className="pt-2 border-t" dangerouslySetInnerHTML={{ __html: t('salary.legend.budgetBalance') }} />
          <p dangerouslySetInnerHTML={{ __html: t('salary.legend.chargesIntro') }} />
          <p className="pl-4" dangerouslySetInnerHTML={{ __html: t('salary.legend.manualMode') }} />
          <p className="pl-4" dangerouslySetInnerHTML={{ __html: t('salary.legend.expenseFactorMode') }} />
        </CardContent>
      </Card>

      <EmployeeDialog
        open={employeeDialogOpen}
        onOpenChange={setEmployeeDialogOpen}
        employee={editingEmployee}
        dimensions={board.dimensions}
        onSave={saveEmployee}
      />
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; tone?: 'default' | 'positive' | 'negative' }> = ({ label, value, tone = 'default' }) => (
  <Card className="border">
    <CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone === 'positive' ? 'text-green-600' : tone === 'negative' ? 'text-red-600' : ''}`}>{value}</div>
    </CardContent>
  </Card>
);

// ---------- Budget panel ----------
const BudgetPanel: React.FC<{
  board: SalaryBoardEntity;
  onChange: (next: SalaryBoardEntity) => void;
}> = ({ board, onChange }) => {
  const { t } = useTranslation();
  const budget = board.budget ?? { scenarios: [], activeScenarioId: undefined };
  const activeScenario =
    budget.scenarios.find(s => s.id === budget.activeScenarioId) ?? budget.scenarios[0] ?? null;

  const updateScenario = (id: string, patch: Partial<SalaryBudgetScenario>) => {
    const scenarios = budget.scenarios.map(s => (s.id === id ? { ...s, ...patch } : s));
    onChange({ ...board, budget: { ...budget, scenarios } });
  };
  const addScenario = () => {
    const s: SalaryBudgetScenario = {
      id: newId(),
      name: t('salary.budget.defaultScenarioName'),
      revenues: 0,
      charges: 0,
      reserve: 0,
    };
    onChange({
      ...board,
      budget: { ...budget, scenarios: [...budget.scenarios, s], activeScenarioId: budget.activeScenarioId ?? s.id },
    });
  };
  const removeScenario = (id: string) => {
    const scenarios = budget.scenarios.filter(s => s.id !== id);
    const activeScenarioId = budget.activeScenarioId === id ? scenarios[0]?.id : budget.activeScenarioId;
    onChange({ ...board, budget: { ...budget, scenarios, activeScenarioId } });
  };
  const duplicateScenario = (id: string) => {
    const original = budget.scenarios.find(s => s.id === id);
    if (!original) return;
    const copy: SalaryBudgetScenario = {
      ...original,
      id: newId(),
      name: t('salary.budget.scenarioCopy', { name: original.name }),
    };
    const scenarios = [...budget.scenarios, copy];
    onChange({ ...board, budget: { ...budget, scenarios } });
  };
  const setActive = (id: string) =>
    onChange({ ...board, budget: { ...budget, activeScenarioId: id } });

  const computation = activeScenario ? computeBudget(board, activeScenario) : null;
  const totals = useMemo(() => aggregateSalaries(board), [board]);
  const currency = board.config.currency;

  return (
    <Card className="border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <PieChart className="w-4 h-4" /> {t('salary.budget.title')}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={addScenario}>
          <Plus className="w-4 h-4 mr-1" /> {t('salary.budget.addScenario')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {budget.scenarios.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            {t('salary.budget.empty')}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {budget.scenarios.map(s => {
            const isActive = s.id === budget.activeScenarioId;
            const sc = computeBudget(board, s);
            return (
              <Card
                key={s.id}
                className={`border cursor-pointer ${isActive ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setActive(s.id)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Input
                      value={s.name}
                      onChange={e => updateScenario(s.id, { name: e.target.value })}
                      onClick={e => e.stopPropagation()}
                      className="font-medium h-8"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); duplicateScenario(s.id); }}
                      title={t('salary.budget.duplicate')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); removeScenario(s.id); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <BudgetField label={t('salary.budget.revenues')} value={s.revenues} onChange={v => updateScenario(s.id, { revenues: v })} currency={currency} />

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('salary.budget.chargesMode')}</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={(s.chargesMode ?? 'manual') === 'manual' ? 'default' : 'outline'}
                        size="sm"
                        onClick={e => { e.stopPropagation(); updateScenario(s.id, { chargesMode: 'manual' }); }}
                      >
                        {t('salary.budget.manualMode')}
                      </Button>
                      <Button
                        type="button"
                        variant={s.chargesMode === 'expenseFactor' ? 'default' : 'outline'}
                        size="sm"
                        onClick={e => { e.stopPropagation(); updateScenario(s.id, { chargesMode: 'expenseFactor' }); }}
                      >
                        {t('salary.budget.expenseFactorMode')}
                      </Button>
                    </div>
                  </div>

                  {s.chargesMode === 'expenseFactor' ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs text-muted-foreground flex-1">
                          {t('salary.budget.expenseFactorLabel', { n: board.config.expenseFactor?.toFixed(2) ?? '1.80' })}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={s.expenseFactorOverride ?? board.config.expenseFactor ?? 1.80}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateScenario(s.id, { expenseFactorOverride: parseFloat(e.target.value) || 1 })}
                          className="w-32 h-8 text-right"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        {t('salary.budget.expenseFactorNote')}
                      </p>
                    </div>
                  ) : (
                    <BudgetField label={t('salary.budget.charges')} value={s.charges} onChange={v => updateScenario(s.id, { charges: v })} currency={currency} />
                  )}

                  <BudgetField label={t('salary.budget.reserve')} value={s.reserve} onChange={v => updateScenario(s.id, { reserve: v })} currency={currency} />
                  <div className="pt-2 border-t space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('salary.budget.grossSalaries')}</span>
                      <span className="font-medium">{formatCurrency(totals?.totalGrossAnnual ?? 0, currency)}</span>
                    </div>
                    {s.chargesMode === 'expenseFactor' ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('salary.budget.charges')}</span>
                          <span className="font-medium">{formatCurrency(sc.charges, currency)}</span>
                        </div>
                        <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                          <span>{t('salary.budget.overheadPortion', { n: ((s.expenseFactorOverride ?? board.config.expenseFactor ?? 1) - 1).toFixed(2) })}</span>
                          <span>{formatCurrency(sc.charges - s.reserve, currency)}</span>
                        </div>
                        <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                          <span>{t('salary.budget.reservePortion')}</span>
                          <span>{formatCurrency(s.reserve, currency)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('salary.budget.charges')}</span>
                          <span className="font-medium">{formatCurrency(sc.charges + sc.reserve, currency)}</span>
                        </div>
                        <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                          <span>{t('salary.budget.overheadPortionShort')}</span>
                          <span>{formatCurrency(sc.charges, currency)}</span>
                        </div>
                        <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                          <span>{t('salary.budget.reservePortion')}</span>
                          <span>{formatCurrency(s.reserve, currency)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">{t('salary.budget.totalCost')}</span>
                      <span className="font-medium">{formatCurrency(sc.totalCost, currency)}</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${sc.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                      <span>{sc.isBalanced ? t('salary.budget.surplus') : t('salary.budget.deficit')}</span>
                      <span>{formatCurrency(Math.abs(sc.balance), currency)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const BudgetField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  currency: string;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-2">
    <Label className="text-xs text-muted-foreground flex-1">{label}</Label>
    <Input
      type="number"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="w-32 h-8 text-right"
    />
  </div>
);

// ---------- Simulator panel (with integrated projection) ----------
const SimulatorPanel: React.FC<{ board: SalaryBoardEntity }> = ({ board }) => {
  const { t } = useTranslation();
  const [workload, setWorkload] = useState(100);
  const [age, setAge] = useState(30);
  const [seniority, setSeniority] = useState(0);
  const [adjustments, setAdjustments] = useState<EmployerAdjustment[]>([{ id: newId(), label: t('salary.employee.defaultAdjustmentLabel'), amount: 0, frequency: 'monthly' }]);
  const [levels, setLevels] = useState<SalaryEmployeeLevel[]>([]);
  const [years, setYears] = useState(20);

  const setLevel = (dimId: string, level: number) => {
    const others = levels.filter(l => l.dimensionId !== dimId);
    setLevels([...others, { dimensionId: dimId, level }]);
  };

  const simulatedEmployee: SalaryEmployee = useMemo(() => ({
    id: 'sim',
    name: t('salary.defaults.simulationName'),
    workload,
    age,
    seniority,
    levels,
    employerAdjustments: adjustments,
  }), [t, workload, age, seniority, levels, adjustments]);

  const result = useMemo(
    () => simulateSalary(board.config, board.dimensions, { workload, age, seniority, levels, employerAdjustments: adjustments }),
    [board, workload, age, seniority, levels, adjustments]
  );

  const projection = useMemo(
    () => buildProjection(board.config, board.dimensions, simulatedEmployee, years),
    [board.config, board.dimensions, simulatedEmployee, years]
  );

  const currency = board.config.currency;

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="w-4 h-4" /> {t('salary.simulator.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>{t('salary.simulator.workload')}</Label>
            <Input type="number" min={0} value={workload} onChange={e => setWorkload(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t('salary.simulator.age')}</Label>
            <Input type="number" value={age} onChange={e => setAge(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t('salary.simulator.seniority')}</Label>
            <Input type="number" min={0} value={seniority} onChange={e => setSeniority(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>{t('salary.simulator.projectionYears')}</Label>
            <Input type="number" min={1} max={50} value={years} onChange={e => setYears(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('salary.simulator.determinants')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {board.dimensions.map(dim => {
              const level = levels.find(l => l.dimensionId === dim.id)?.level ?? 0;
              return (
                <div key={dim.id} className="flex items-center gap-2">
                  <span className="text-sm w-40 truncate" style={{ color: dim.color }}>{dim.name}</span>
                  <Select value={String(level)} onValueChange={v => setLevel(dim.id, parseInt(v, 10))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: dim.maxLevel + 1 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{t('salary.simulator.levelN', { i })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {dim.levelDescriptions?.[level] && (
                    <span className="text-xs text-muted-foreground italic flex-1 min-w-0 truncate">
                      {dim.levelDescriptions[level]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Employer adjustments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('salary.simulator.adjustments')}</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustments([...adjustments, { id: newId(), label: t('salary.employee.defaultAdjustmentLabel'), amount: 0, frequency: 'monthly' }])}
            >
              <Plus className="w-3 h-3 mr-1" /> {t('salary.simulator.addAdjustment')}
            </Button>
          </div>
          {adjustments.map((adj, i) => (
            <div key={adj.id} className="flex gap-2 items-center">
              <Input
                value={adj.label}
                onChange={e => {
                  const next = [...adjustments];
                  next[i] = { ...adj, label: e.target.value };
                  setAdjustments(next);
                }}
                placeholder={t('salary.simulator.adjustmentPlaceholder')}
                className="flex-1"
              />
              <Input
                type="number"
                value={adj.amount}
                onChange={e => {
                  const next = [...adjustments];
                  next[i] = { ...adj, amount: parseFloat(e.target.value) || 0 };
                  setAdjustments(next);
                }}
                className="w-28 text-right"
              />
              <Select
                value={adj.frequency ?? 'monthly'}
                onValueChange={v => {
                  const next = [...adjustments];
                  next[i] = { ...adj, frequency: v as 'monthly' | 'semesterly' | 'annually' };
                  setAdjustments(next);
                }}
              >
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('salary.frequency.monthly')}</SelectItem>
                  <SelectItem value="semesterly">{t('salary.frequency.semesterly')}</SelectItem>
                  <SelectItem value="annually">{t('salary.frequency.annually')}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAdjustments(adjustments.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2 border-t">
          <MetricCard label={t('salary.metric.hourlyRate')} value={formatCurrency(result.gross100Hourly, currency)} />
          <MetricCard label={t('salary.metric.grossMonthly100')} value={formatCurrency(result.gross100, currency)} />
          <MetricCard label={t('salary.metric.grossAnnual100')} value={formatCurrency(result.gross100Annual, currency)} />
          <MetricCard label={t('salary.metric.grossMonthly13')} value={formatCurrency(result.grossMonthlyWith13, currency)} />
          <MetricCard label={t('salary.metric.grossMonthly13Adj')} value={formatCurrency(result.grossMonthlyWith13AndAdjustments, currency)} />
          <MetricCard label={t('salary.metric.netApprox')} value={formatCurrency(result.netMonthlyWith13, currency)} />
        </div>

        {/* Projection table */}
        <div className="space-y-2 pt-2 border-t">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> {t('salary.simulator.projectionTitle', { n: years })}
          </CardTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('salary.projection.year')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.age')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.seniority')}</TableHead>
                <TableHead className="text-right bg-muted/50">{t('salary.projection.hourlyRate')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.grossMonthly100')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.grossAnnual100')}</TableHead>
                <TableHead className="text-right bg-muted/50">{t('salary.projection.grossMonthly')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.grossMonthly13')}</TableHead>
                <TableHead className="text-right bg-muted/50">{t('salary.projection.grossMonthly13Adj')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.grossAnnualAdj')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.net')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.employerCostAnnual')}</TableHead>
                <TableHead className="text-right">{t('salary.projection.ageBrackets')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projection.map(row => (
                <TableRow key={row.year}>
                  <TableCell>+{row.year}</TableCell>
                  <TableCell className="text-right">{row.age}</TableCell>
                  <TableCell className="text-right">{row.seniority}</TableCell>
                  <TableCell className="text-right bg-muted/30">{formatCurrency(row.gross100Hourly, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.gross100, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.gross100Annual, currency)}</TableCell>
                  <TableCell className="text-right bg-muted/30">{formatCurrency(row.grossMonthlyPure, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.grossMonthlyWith13, currency)}</TableCell>
                  <TableCell className="text-right bg-muted/30">{formatCurrency(row.grossMonthlyWith13AndAdjustments, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.grossAnnualWithout13, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.netMonthlyWith13, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.employerCostAnnual, currency)}</TableCell>
                  <TableCell className="text-right">{row.ageBracketSteps}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

// ---------- Team simulator panel ----------
const TeamSimulatorPanel: React.FC<{ board: SalaryBoardEntity }> = ({ board }) => {
  const { t } = useTranslation();
  // Local mutable copies — not persisted, just for what-if simulation
  const [simConfig, setSimConfig] = useState<SalaryConfig>({ ...board.config });
  const [simDimensions, setSimDimensions] = useState<SalaryDimension[]>(
    board.dimensions.map(d => ({ ...d, levelDescriptions: [...(d.levelDescriptions ?? [])] }))
  );
  const [simEmployees, setSimEmployees] = useState<SalaryEmployee[]>(
    board.employees.map(e => ({ ...e, levels: [...e.levels], employerAdjustments: e.employerAdjustments?.map(a => ({ ...a })) }))
  );
  const [simEmployeeOpen, setSimEmployeeOpen] = useState(false);
  const [editingSimEmployee, setEditingSimEmployee] = useState<SalaryEmployee | null>(null);

  // Reset when board changes externally
  useEffect(() => {
    setSimConfig({ ...board.config });
    setSimDimensions(board.dimensions.map(d => ({ ...d, levelDescriptions: [...(d.levelDescriptions ?? [])] })));
    setSimEmployees(board.employees.map(e => ({ ...e, levels: [...e.levels], employerAdjustments: e.employerAdjustments?.map(a => ({ ...a })) })));
  }, [board.config, board.dimensions, board.employees]);

  const simBoard = useMemo<SalaryBoardEntity>(() => ({
    ...board,
    config: simConfig,
    dimensions: simDimensions,
    employees: simEmployees,
  }), [board, simConfig, simDimensions, simEmployees]);

  const totals = useMemo(() => aggregateSalaries(simBoard), [simBoard]);
  const currency = simConfig.currency;

  const updateConfig = <K extends keyof SalaryConfig>(key: K, value: SalaryConfig[K]) =>
    setSimConfig(prev => ({ ...prev, [key]: value }));

  const updateDimension = (id: string, patch: Partial<SalaryDimension>) =>
    setSimDimensions(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));

  const toggleEmployee = (id: string) =>
    setSimEmployees(prev => prev.map(e => e.id === id ? { ...e, _simHidden: !e._simHidden } : e));

  const addSimEmployee = () => {
    setEditingSimEmployee(null);
    setSimEmployeeOpen(true);
  };

  const editSimEmployee = (emp: SalaryEmployee) => {
    setEditingSimEmployee(emp);
    setSimEmployeeOpen(true);
  };

  const saveSimEmployee = (emp: SalaryEmployee) => {
    setSimEmployees(prev => {
      const exists = prev.some(e => e.id === emp.id);
      return exists
        ? prev.map(e => e.id === emp.id ? emp : e)
        : [...prev, emp];
    });
  };

  const removeSimEmployee = (id: string) =>
    setSimEmployees(prev => prev.filter(e => e.id !== id));

  const duplicateSimEmployee = (id: string) => {
    const original = simEmployees.find(e => e.id === id);
    if (!original) return;
    const copy: SalaryEmployee = {
      ...original,
      id: newId(),
      name: `${original.name} (${t('common.duplicate').toLowerCase()})`,
      levels: [...original.levels],
      employerAdjustments: original.employerAdjustments?.map(a => ({ ...a })),
      _simHidden: false,
    };
    setSimEmployees(prev => [...prev, copy]);
  };

  // Compute budget for each scenario with the simulated config
  const budgetResults = useMemo(() => {
    if (!board.budget) return [];
    return board.budget.scenarios.map(s => ({
      scenario: s,
      computation: computeBudget(simBoard, s),
    }));
  }, [board.budget, simBoard]);

  const resetToBoard = () => {
    setSimConfig({ ...board.config });
    setSimDimensions(board.dimensions.map(d => ({ ...d, levelDescriptions: [...(d.levelDescriptions ?? [])] })));
    setSimEmployees(board.employees.map(e => ({ ...e, levels: [...e.levels], employerAdjustments: e.employerAdjustments?.map(a => ({ ...a })) })));
  };

  return (
    <>
    <Card className="border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="w-4 h-4" /> {t('salary.teamSimulator.title')}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={resetToBoard}>
          <RotateCcw className="w-4 h-4 mr-1" /> {t('salary.teamSimulator.reset')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground italic">
          {t('salary.teamSimulator.help')}
        </p>

        {/* Global parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.teamSimulator.indexHourlyWage')}</Label>
            <Input
              type="number"
              step="0.01"
              value={simConfig.indexHourlyWage}
              onChange={e => updateConfig('indexHourlyWage', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.teamSimulator.hoursPerWeek')}</Label>
            <Input
              type="number"
              value={simConfig.hoursPerWeek}
              onChange={e => updateConfig('hoursPerWeek', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.teamSimulator.seniorityIncrease')}</Label>
            <Input
              type="number"
              step="0.001"
              value={simConfig.seniorityIncrease}
              onChange={e => updateConfig('seniorityIncrease', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.teamSimulator.ageIncrease')}</Label>
            <Input
              type="number"
              step="0.001"
              value={simConfig.ageIncrease}
              onChange={e => updateConfig('ageIncrease', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.teamSimulator.socialCharges')}</Label>
            <Input
              type="number"
              step="0.0001"
              value={simConfig.socialChargesRate}
              onChange={e => updateConfig('socialChargesRate', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.teamSimulator.expenseFactor')}</Label>
            <Input
              type="number"
              step="0.01"
              value={simConfig.expenseFactor ?? 1}
              onChange={e => updateConfig('expenseFactor', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Dimension step values */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">{t('salary.teamSimulator.dimensionSteps')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {simDimensions.map(dim => (
              <div key={dim.id} className="flex items-center gap-2">
                <span className="text-sm w-40 truncate" style={{ color: dim.color }}>{dim.name}</span>
                <Input
                  type="number"
                  step="1"
                  value={dim.stepValue}
                  onChange={e => updateDimension(dim.id, { stepValue: parseFloat(e.target.value) || 0 })}
                  className="w-28 text-right"
                />
                <span className="text-xs text-muted-foreground">{t('salary.teamSimulator.chfPerLevel')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Employee list with toggle/add/remove */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">{t('salary.teamSimulator.staff')}</Label>
            <Button variant="outline" size="sm" onClick={addSimEmployee}>
              <Plus className="w-3 h-3 mr-1" /> {t('salary.teamSimulator.add')}
            </Button>
          </div>
          <div className="space-y-1">
            {simEmployees.map(emp => {
              const comp = computeSalary(simConfig, simDimensions, { ...emp, _simHidden: false });
              return (
                <div
                  key={emp.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded border ${emp._simHidden ? 'opacity-40' : ''}`}
                >
                  <span className="text-sm flex-1 truncate font-medium">
                    {emp.name || <span className="italic text-muted-foreground">{t('salary.employee.unnamed')}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{emp.workload}%</span>
                  {!emp._simHidden && (
                    <span className="text-xs text-right w-28">{formatCurrency(comp.grossMonthly, currency)}</span>
                  )}
                  <div className="flex items-center">
                    <Button variant="ghost" size="sm" onClick={() => editSimEmployee(emp)} className="w-8 h-8 p-0" title={t('salary.action.edit')}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => duplicateSimEmployee(emp.id)} className="w-8 h-8 p-0" title={t('salary.action.duplicate')}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleEmployee(emp.id)}
                      title={emp._simHidden ? t('salary.action.include') : t('salary.action.exclude')}
                      className="w-8 h-8 p-0"
                    >
                      {emp._simHidden
                        ? <EyeOff className="w-3 h-3" />
                        : <Eye className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              );
            })}
            {simEmployees.length === 0 && (
              <p className="text-xs text-muted-foreground italic">{t('salary.teamSimulator.empty')}</p>
            )}
          </div>
        </div>

        {/* Results: salary mass */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2 border-t">
          <MetricCard label={t('salary.metric.headcount')} value={String(totals.headcount)} />
          <MetricCard label={t('salary.metric.fte')} value={totals.fte.toFixed(2)} />
          <MetricCard label={t('salary.teamSimulator.grossMonthly')} value={formatCurrency(totals.totalGrossMonthly, currency)} />
          <MetricCard label={t('salary.teamSimulator.grossAnnual')} value={formatCurrency(totals.totalGrossAnnual, currency)} />
          <MetricCard label={t('salary.metric.netApprox')} value={formatCurrency(totals.totalNetMonthlyWith13, currency)} />
          <MetricCard label={t('salary.metric.employerCostAnnual')} value={formatCurrency(totals.totalEmployerCostAnnual, currency)} />
        </div>

        {/* Results: budget impact per scenario */}
        {budgetResults.length > 0 && (
          <div className="pt-2 border-t">
            <Label className="text-xs font-medium mb-2 block">{t('salary.teamSimulator.budgetImpact')}</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('salary.budget.scenario')}</TableHead>
                  <TableHead className="text-right">{t('salary.budget.revenues')}</TableHead>
                  <TableHead className="text-right">{t('salary.budget.grossSalaries')}</TableHead>
                  <TableHead className="text-right">{t('salary.budget.charges')}</TableHead>
                  <TableHead className="text-right">{t('salary.budget.totalCost')}</TableHead>
                  <TableHead className="text-right">{t('salary.budget.balance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgetResults.map(({ scenario, computation }) => (
                  <TableRow key={scenario.id}>
                    <TableCell className="font-medium">{scenario.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(computation.revenues, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.totalGrossAnnual, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(computation.charges + computation.reserve, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(computation.totalCost, currency)}</TableCell>
                    <TableCell className={`text-right font-semibold ${computation.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(computation.balance, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
             </Table>
          </div>
        )}
      </CardContent>
    </Card>
      <EmployeeDialog
        open={simEmployeeOpen}
        onOpenChange={setSimEmployeeOpen}
        employee={editingSimEmployee}
        dimensions={simDimensions}
        onSave={saveSimEmployee}
      />
    </>
  );
};

// ---------- Hourly rate projected panel ----------
// Reproduces ADT Q13 (Client Hourly Rate) and Q14 (Tarif réduit):
// Q13 = CEILING.MATH(ROUND((base + maxExp×step + maxImp×step) × (1+seniority)^years × (1+age)^brackets, 0) / weeksPerMonth / hoursPerWeek × expenseFactor, 5)
// Q14 = CEILING.MATH(Q13 × 0.5, 5)

const computeHourlyRate = (
  config: SalaryConfig,
  dimensions: SalaryDimension[],
  persona: {
    levels: { dimensionId: string; level: number }[];
    seniorityYears: number;
    age: number;
  },
): { clientHourlyRate: number; reducedRate: number; projectedAnnualGross: number } => {
  const base = config.indexHourlyWage * config.hoursPerWeek * config.weeksPerMonth;

  // Sum all salary-affecting dimensions at the persona's chosen levels
  const dimSteps = dimensions.reduce((sum, dim) => {
    if (dim.affectsSalary === false) return sum;
    const level = Math.min(
      persona.levels.find(l => l.dimensionId === dim.id)?.level ?? 0,
      dim.maxLevel,
    );
    return sum + level * dim.stepValue;
  }, 0);

  // Compute age brackets from the persona's age
  const ageBrackets = config.ageBrackets.filter(b => persona.age >= b).length;

  const gross100 = Math.round(
    (base + dimSteps) *
    Math.pow(1 + config.seniorityIncrease, persona.seniorityYears) *
    Math.pow(1 + config.ageIncrease, ageBrackets)
  );

  const factor = config.expenseFactor ?? 1;
  const raw = gross100 / config.weeksPerMonth / config.hoursPerWeek * factor;
  const clientHourlyRate = Math.ceil(raw / 5) * 5;

  return { clientHourlyRate, reducedRate: 0, projectedAnnualGross: gross100 };
};

const HourlyRatePanel: React.FC<{ board: SalaryBoardEntity; onSave: (next: SalaryBoardEntity) => void }> = ({ board, onSave }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const saved = board.config.hourlyRatePersona;
  // Default persona: all dimensions at max level, 20 years seniority, age 65
  const defaultLevels = board.dimensions.map(d => ({ dimensionId: d.id, level: saved?.levels?.find(l => l.dimensionId === d.id)?.level ?? d.maxLevel }));
  const [levels, setLevels] = useState<{ dimensionId: string; level: number }[]>(defaultLevels);
  const [seniorityYears, setSeniorityYears] = useState(saved?.seniorityYears ?? 20);
  const [age, setAge] = useState(saved?.age ?? 65);
  const [reducedRateMultiplier, setReducedRateMultiplier] = useState(saved?.reducedRateMultiplier ?? 0.5);
  const [riskBenefitMultiplier, setRiskBenefitMultiplier] = useState(saved?.riskBenefitMultiplier ?? 0.30);

  // Only reset levels when the set of dimension IDs actually changes (not on every board update)
  const dimIds = board.dimensions.map(d => d.id).join(',');
  const prevDimIds = React.useRef(dimIds);
  useEffect(() => {
    if (prevDimIds.current !== dimIds) {
      prevDimIds.current = dimIds;
      setLevels(board.dimensions.map(d => ({ dimensionId: d.id, level: d.maxLevel })));
    }
  }, [dimIds, board.dimensions]);

  const setLevel = (dimId: string, level: number) => {
    setLevels(prev => {
      const others = prev.filter(l => l.dimensionId !== dimId);
      return [...others, { dimensionId: dimId, level }];
    });
  };

  const result = useMemo(
    () => computeHourlyRate(board.config, board.dimensions, { levels, seniorityYears, age }),
    [board.config, board.dimensions, levels, seniorityYears, age]
  );

  const riskBenefitRate = useMemo(
    () => Math.ceil((result.clientHourlyRate * (1 + riskBenefitMultiplier)) / 5) * 5,
    [result.clientHourlyRate, riskBenefitMultiplier]
  );

  const reducedRate = useMemo(
    () => Math.ceil((riskBenefitRate * reducedRateMultiplier) / 5) * 5,
    [riskBenefitRate, reducedRateMultiplier]
  );

  const currency = board.config.currency;

  const savePersona = () => {
    onSave({
      ...board,
      config: {
        ...board.config,
        hourlyRatePersona: { seniorityYears, age, reducedRateMultiplier, riskBenefitMultiplier, levels },
      },
    });
    toast({ title: t('salary.hourlyRate.toastTitle'), description: t('salary.hourlyRate.toastDescription') });
  };

  return (
    <Card className="border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="w-4 h-4" /> {t('salary.hourlyRate.title')}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={savePersona}>
          <Save className="w-4 h-4 mr-1" /> {t('salary.hourlyRate.save')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground italic">
          {t('salary.hourlyRate.help')}
        </p>

        {/* Persona: all dimensions */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">{t('salary.hourlyRate.determinants')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {board.dimensions.map(dim => {
              const level = levels.find(l => l.dimensionId === dim.id)?.level ?? 0;
              return (
                <div key={dim.id} className="flex items-center gap-2">
                  <span className="text-sm w-40 truncate" style={{ color: dim.color }}>{dim.name}</span>
                  <Select value={String(level)} onValueChange={v => setLevel(dim.id, parseInt(v, 10))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: dim.maxLevel + 1 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{t('salary.hourlyRate.levelN', { i })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {dim.levelDescriptions?.[level] && (
                    <span className="text-xs text-muted-foreground italic flex-1 min-w-0 truncate">
                      {dim.levelDescriptions[level]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Seniority & age */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.hourlyRate.seniorityYears')}</Label>
            <Input type="number" min={0} value={seniorityYears} onChange={e => setSeniorityYears(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.hourlyRate.personaAge')}</Label>
            <Input type="number" min={0} value={age} onChange={e => setAge(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.hourlyRate.riskBenefit')}</Label>
            <Input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={riskBenefitMultiplier}
              onChange={e => setRiskBenefitMultiplier(parseFloat(e.target.value) || 0)}
              className="text-right"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('salary.hourlyRate.reducedRateMultiplier')}</Label>
            <Input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={reducedRateMultiplier}
              onChange={e => setReducedRateMultiplier(parseFloat(e.target.value) || 0)}
              className="text-right"
            />
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t">
          <MetricCard label={t('salary.hourlyRate.projectedGross')} value={formatCurrency(result.projectedAnnualGross, currency)} />
          <MetricCard label={t('salary.hourlyRate.clientRate')} value={formatCurrency(riskBenefitRate, currency)} />
          <MetricCard label={t('salary.hourlyRate.reducedRate')} value={formatCurrency(reducedRate, currency)} />
        </div>
      </CardContent>
    </Card>
  );
};

export default SalaryView;