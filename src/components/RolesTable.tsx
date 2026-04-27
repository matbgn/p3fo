import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { CircleEntity, RoleAssignment } from '@/lib/persistence-types';
import { useCircles } from '@/hooks/useCircles';
import { useUsers, UserWithTrigram } from '@/hooks/useUsers';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, MinusCircle, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type RoleRow = {
  id: string;
  name: string;
  circleName: string;
  circleId: string;
  assignments: RoleAssignment[];
};

type RoleTableView = 'list' | 'byUser';

const AssignmentBadges: React.FC<{ assignments: RoleAssignment[]; users: UserWithTrigram[] }> = ({ assignments, users }) => {
  if (!assignments || assignments.length === 0) {
    return <span className="text-muted-foreground italic">Unassigned</span>;
  }
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {assignments.map((a, i) => {
        const user = users.find(u => u.userId === a.userId);
        if (!user) return null;
        return (
          <Badge key={`${a.userId}-${i}`} variant="outline" className="flex items-center gap-1 px-2 py-1">
            <UserAvatar username={user.username} size="sm" trigram={user.trigram} showTooltip={false} />
            <span className="text-xs">{a.involvementType}</span>
          </Badge>
        );
      })}
    </div>
  );
};

export const getCircleParent = (role: CircleEntity, map: Map<string, CircleEntity>): { id: string; name: string } => {
  if (!role.parentId) return { id: 'none', name: 'No Circle' };
  let current = map.get(role.parentId);
  while (current) {
    if (current.nodeType !== 'role') {
      return { id: current.id, name: current.name || 'Unknown' };
    }
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return { id: 'none', name: 'No Circle' };
};

export const RolesTable: React.FC = () => {
  const { circles } = useCircles();
  const { users } = useUsers();

  const roles = useMemo<RoleRow[]>(() => {
    const circleMap = new Map<string, CircleEntity>();
    circles.forEach(c => circleMap.set(c.id, c));

    return circles
      .filter(c => c.nodeType === 'role')
      .map(c => {
        const parent = getCircleParent(c, circleMap);
        return {
          id: c.id,
          name: c.name,
          circleName: parent.name,
          circleId: parent.id,
          assignments: c.assignments || [],
        };
      });
  }, [circles]);

  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [view, setView] = useState<RoleTableView>('list');

  // Collapsible section state for categorical views
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsedGroups(new Set());
  const collapseAll = (groupIds: string[]) => setCollapsedGroups(new Set(groupIds));

  const columns = useMemo<ColumnDef<RoleRow>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Role Name',
      cell: info => <span className="font-medium">{info.getValue<string>()}</span>,
    },
    {
      accessorKey: 'circleName',
      header: 'Circle / Group',
      cell: info => info.getValue<string>(),
    },
    {
      id: 'assignments',
      accessorKey: 'assignments',
      header: 'Role Assignments',
      cell: info => <AssignmentBadges assignments={info.getValue<RoleAssignment[]>()} users={users} />,
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue) return true;
        const val = String(filterValue).toLowerCase();
        const assignments = row.original.assignments;
        if (!assignments) return false;
        return assignments.some(a => {
          const user = users.find(u => u.userId === a.userId);
          return (
            (user?.username.toLowerCase() || '').includes(val) ||
            (user?.trigram.toLowerCase() || '').includes(val) ||
            a.involvementType.toLowerCase().includes(val)
          );
        });
      },
      enableColumnFilter: true,
    },
  ], [users]);

  const table = useReactTable({
    data: roles,
    columns,
    state: {
      globalFilter,
      sorting,
      pagination: { pageIndex: 0, pageSize: view === 'list' ? 25 : roles.length },
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase();
      const role = row.original;
      if (role.name.toLowerCase().includes(search)) return true;
      if (role.circleName.toLowerCase().includes(search)) return true;
      if (role.assignments.some(a => {
        const user = users.find(u => u.userId === a.userId);
        return (
          (user?.username.toLowerCase() || '').includes(search) ||
          (user?.trigram.toLowerCase() || '').includes(search) ||
          a.involvementType.toLowerCase().includes(search)
        );
      })) return true;
      return false;
    },
  });

  const filteredRows = table.getFilteredRowModel().rows;

  const groupedByUser = useMemo(() => {
    const map = new Map<string, { user: UserWithTrigram | null; rows: typeof filteredRows }>();
    const unassigned: typeof filteredRows = [];

    filteredRows.forEach(r => {
      if (!r.original.assignments || r.original.assignments.length === 0) {
        unassigned.push(r);
      } else {
        r.original.assignments.forEach(a => {
          const user = users.find(u => u.userId === a.userId);
          const userId = user?.userId || `unknown-${a.userId}`;
          const entry = map.get(userId);
          if (entry) {
            if (!entry.rows.some(row => row.original.id === r.original.id)) {
              entry.rows.push(r);
            }
          } else {
            map.set(userId, { user: user || null, rows: [r] });
          }
        });
      }
    });

    if (unassigned.length > 0) {
      map.set('unassigned', { user: null, rows: unassigned });
    }

    return Array.from(map.values()).sort((a, b) => {
      const aName = a.user?.username || 'Unassigned';
      const bName = b.user?.username || 'Unassigned';
      return aName.localeCompare(bName);
    });
  }, [filteredRows, users]);

  // Reset collapsed groups when view or filter changes
  React.useEffect(() => {
    setCollapsedGroups(new Set());
  }, [view, globalFilter]);

  const renderListTable = () => (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map(hg => (
          <React.Fragment key={hg.id}>
            <TableRow>
              {hg.headers.map(header => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' && <span>↑</span>}
                    {header.column.getIsSorted() === 'desc' && <span>↓</span>}
                  </div>
                </TableHead>
              ))}
            </TableRow>
            {/* Column filter row */}
            <TableRow className="border-b-0">
              {hg.headers.map(header => (
                <TableHead key={`${header.id}-filter`} className="pt-0 pb-2">
                  {header.column.getCanFilter() ? (
                    <Input
                      placeholder={`Filter ${String(header.column.columnDef.header)}...`}
                      value={(header.column.getFilterValue() as string) || ''}
                      onChange={e => header.column.setFilterValue(e.target.value)}
                      className="h-7 text-xs w-full"
                    />
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </React.Fragment>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
              No roles match the current filters.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const renderByUserView = () => {
    const allGroupIds = groupedByUser.map(g => g.user?.userId || 'unassigned');
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            <PlusCircle className="w-4 h-4 mr-1" /> Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => collapseAll(allGroupIds)}>
            <MinusCircle className="w-4 h-4 mr-1" /> Collapse All
          </Button>
        </div>
        {groupedByUser.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No roles match the current filters.</p>
        ) : (
          groupedByUser.map(group => {
            const groupId = group.user?.userId || 'unassigned';
            const isCollapsed = collapsedGroups.has(groupId);
            return (
              <div key={groupId}>
                <button
                  className="w-full flex items-center gap-2 text-left group mb-2"
                  onClick={() => toggleGroup(groupId)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                  <div className={cn(
                    "flex items-center gap-2 text-base font-semibold transition-colors",
                    isCollapsed ? "text-muted-foreground" : "text-primary"
                  )}>
                    {group.user ? (
                      <>
                        <UserAvatar
                          username={group.user.username}
                          size="sm"
                          trigram={group.user.trigram}
                          showTooltip={false}
                        />
                        {group.user.username}
                      </>
                    ) : (
                      <span className="italic">Unassigned</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">{group.rows.length}</Badge>
                </button>
                {!isCollapsed && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role Name</TableHead>
                        <TableHead>Circle / Group</TableHead>
                        <TableHead>Involvement</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map(row => {
                        const relevantAssignments = row.original.assignments.filter(a => {
                          if (!group.user) return true;
                          return a.userId === group.user.userId;
                        });
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.original.name}</TableCell>
                            <TableCell>{row.original.circleName}</TableCell>
                            <TableCell>
                              {relevantAssignments.length > 0 ? (
                                <div className="flex gap-1 flex-wrap">
                                  {relevantAssignments.map((a, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {a.involvementType}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search roles..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="w-64"
          />
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => value && setView(value as RoleTableView)}
          aria-label="Roles View"
        >
          <ToggleGroupItem value="list" aria-label="List View">
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="byUser" aria-label="By User">
            By User
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex-grow overflow-auto">
        {view === 'list' && renderListTable()}
        {view === 'byUser' && renderByUserView()}
      </div>

      {view === 'list' && (
        <div className="flex items-center justify-between py-2">
          <div className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} role(s) found
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              {'<<'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {'<'}
            </Button>
            <span className="text-sm px-2">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {'>'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              {'>>'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
