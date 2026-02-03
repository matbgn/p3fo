import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useCircles, CircleTreeNode } from '@/hooks/useCircles';
import { CircleNodeType } from '@/lib/persistence-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, Move, Home, ChevronRight, ChevronDown, Circle, Users, User, Building2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface CirclesViewProps {
  onFocusOnTask?: (taskId: string) => void;
}

// Color palette based on OMO2 EasyCIRCLE
const NODE_COLORS = {
  organization: 'rgb(61, 168, 169)',  // Teal for root organization
  circle: 'rgba(255, 255, 255, 0.4)', // Semi-transparent white for circles
  group: 'rgba(0, 0, 0, 0)',          // Transparent for groups (dashed border)
  role: 'rgb(255, 204, 0)',           // Yellow default for roles
};

// Icon component for node types
const NodeTypeIcon: React.FC<{ nodeType: CircleNodeType; className?: string }> = ({ nodeType, className }) => {
  switch (nodeType) {
    case 'organization':
      return <Building2 className={className} />;
    case 'circle':
      return <Circle className={className} />;
    case 'group':
      return <Users className={className} />;
    case 'role':
      return <User className={className} />;
    default:
      return <Circle className={className} />;
  }
};

// Recursive tree node component
interface TreeNodeItemProps {
  node: CircleTreeNode;
  currentNodeId: string | null;
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
  onSelect: (node: CircleTreeNode) => void;
  depth: number;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  currentNodeId,
  expandedNodes,
  onToggle,
  onSelect,
  depth,
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = currentNodeId === node.id;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-muted/50 transition-colors',
          isSelected && 'bg-primary/20 font-medium'
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <NodeTypeIcon
          nodeType={node.nodeType}
          className={cn(
            'w-3.5 h-3.5',
            node.nodeType === 'organization' && 'text-teal-500',
            node.nodeType === 'circle' && 'text-gray-500',
            node.nodeType === 'group' && 'text-blue-500',
            node.nodeType === 'role' && 'text-yellow-500'
          )}
        />
        <span className="text-sm truncate flex-1">{node.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              currentNodeId={currentNodeId}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CirclesView: React.FC<CirclesViewProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  const {
    circles,
    buildCircleTree,
    createCircle,
    updateCircle,
    deleteCircle,
    loadCircles,
  } = useCircles();

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [currentNode, setCurrentNode] = useState<CircleTreeNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<CircleTreeNode | null>(null);
  const [zoomInfo, setZoomInfo] = useState({ centerX: 0, centerY: 0, scale: 1 });
  const [nodes, setNodes] = useState<CircleTreeNode[]>([]);
  const [colorToNode, setColorToNode] = useState<Map<string, CircleTreeNode>>(new Map());

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<'add' | 'edit'>('add');
  const [editName, setEditName] = useState('');
  const [editNodeType, setEditNodeType] = useState<CircleNodeType>('role');
  const [editColor, setEditColor] = useState('#FFCC00');
  const [editDescription, setEditDescription] = useState('');

  // Move dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);

  // Tree panel state
  const [treePanelOpen, setTreePanelOpen] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Generate unique color for hidden canvas hit detection
  const colorIndex = useRef(1);
  const genColor = useCallback(() => {
    const ret = [];
    if (colorIndex.current < 16777215) {
      ret.push(colorIndex.current & 0xff);
      ret.push((colorIndex.current & 0xff00) >> 8);
      ret.push((colorIndex.current & 0xff0000) >> 16);
      colorIndex.current += 1;
    }
    return `rgb(${ret.join(',')})`;
  }, []);

  // Build tree data and calculate pack layout
  const buildPackedTree = useCallback(() => {
    const treeData = buildCircleTree();

    if (treeData.length === 0) {
      return [];
    }

    // Wrap in root if multiple roots
    const rootData: CircleTreeNode = treeData.length === 1
      ? treeData[0]
      : {
        id: 'virtual-root',
        name: 'Organization',
        nodeType: 'organization',
        size: 1,
        children: treeData,
      };

    const diameter = Math.min(dimensions.width, dimensions.height) * 0.9;

    const pack = d3.pack<CircleTreeNode>()
      .size([diameter, diameter])
      .padding(3);

    const hierarchy = d3.hierarchy(rootData)
      .sum(d => d.children && d.children.length > 0 ? 0 : (d.size || 10))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const packedRoot = pack(hierarchy);

    const allNodes: CircleTreeNode[] = [];
    packedRoot.each(node => {
      const treeNode = node.data;
      treeNode.x = node.x;
      treeNode.y = node.y;
      treeNode.r = node.r;
      treeNode.depth = node.depth;
      treeNode.parent = node.parent?.data || null;
      allNodes.push(treeNode);
    });

    return allNodes;
  }, [buildCircleTree, dimensions]);

  // Initialize or refresh the visualization
  const refreshVisualization = useCallback(() => {
    const packedNodes = buildPackedTree();
    setNodes(packedNodes);

    if (packedNodes.length > 0 && !currentNode) {
      setCurrentNode(packedNodes[0]);
    }

    // Reset color mapping
    colorIndex.current = 1;
    setColorToNode(new Map());
  }, [buildPackedTree, currentNode]);

  // Draw the canvas
  const drawCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    hidden: boolean = false
  ) => {
    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    const newColorMap = new Map<string, CircleTreeNode>();

    // Clear canvas
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);

    // Draw each node
    for (const node of nodes) {
      if (node.x === undefined || node.y === undefined || node.r === undefined) continue;

      // Simple transform: translate so zoom center is at canvas center, then scale
      const nodeX = (node.x - zoomInfo.centerX) * zoomInfo.scale + centerX;
      const nodeY = (node.y - zoomInfo.centerY) * zoomInfo.scale + centerY;
      const nodeR = node.r * zoomInfo.scale * (node.nodeType === 'role' ? 0.9 : node.nodeType === 'organization' ? 1.05 : 1);

      ctx.beginPath();

      // Draw octagon for hierarchy modifier
      if (node.modifier === 'hierarchy') {
        const sides = 8;
        for (let i = 0; i <= sides; i++) {
          const angle = (2 * Math.PI / sides) * i;
          const px = nodeX + nodeR * Math.cos(angle);
          const py = nodeY + nodeR * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
      } else {
        ctx.arc(nodeX, nodeY, nodeR, 0, 2 * Math.PI, true);
      }

      if (hidden) {
        // Hidden canvas: unique color per node for hit detection
        const nodeColor = genColor();
        newColorMap.set(nodeColor, node);
        ctx.fillStyle = nodeColor;
        ctx.fill();
      } else {
        // Visible canvas: styled rendering
        let fillColor: string;
        if (node.nodeType === 'organization') {
          fillColor = NODE_COLORS.organization;
        } else if (node.nodeType === 'circle') {
          fillColor = NODE_COLORS.circle;
        } else if (node.nodeType === 'group') {
          fillColor = NODE_COLORS.group;
        } else {
          fillColor = node.color || NODE_COLORS.role;
        }

        ctx.fillStyle = fillColor;
        ctx.fill();

        // Border styles
        if (node.nodeType === 'organization') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (node.nodeType === 'group') {
          ctx.setLineDash([10, 10]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Template pattern (striped) for template roles
        if (node.modifier === 'template') {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.lineWidth = 1;
          // Draw diagonal lines
          const step = 6;
          ctx.save();
          ctx.clip();
          for (let i = -nodeR * 2; i < nodeR * 2; i += step) {
            ctx.beginPath();
            ctx.moveTo(nodeX + i, nodeY - nodeR);
            ctx.lineTo(nodeX + i + nodeR * 2, nodeY + nodeR);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Highlight current node
        if (currentNode && node.id === currentNode.id) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
          ctx.lineWidth = 6;
          ctx.stroke();
        } else if (hoveredNode && node.id === hoveredNode.id) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }

    if (hidden) {
      setColorToNode(newColorMap);
    }

    // Draw text labels (only on visible canvas)
    if (!hidden) {
      for (const node of nodes) {
        if (node.x === undefined || node.y === undefined || node.r === undefined) continue;

        const nodeX = ((node.x - zoomInfo.centerX) * zoomInfo.scale) + centerX;
        const nodeY = ((node.y - zoomInfo.centerY) * zoomInfo.scale) + centerY;
        const nodeR = node.r * zoomInfo.scale * (node.nodeType === 'role' ? 0.9 : 1);

        // Only draw text for visible nodes near current context
        const shouldShowText = currentNode && (
          node.id === currentNode.id ||
          node.parent?.id === currentNode.id ||
          node.id === currentNode.parent?.id ||
          node.parent?.id === currentNode.parent?.id
        );

        if (shouldShowText && nodeR > 20) {
          const fontSize = Math.min(Math.round(nodeR / 4), 24);
          if (fontSize >= 8) {
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (node.nodeType === 'role') {
              ctx.fillStyle = '#000000';
              ctx.strokeStyle = '#FFFFFF';
            } else {
              ctx.fillStyle = '#FFFFFF';
              ctx.strokeStyle = '#000000';
            }

            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';

            // Word wrap text
            const words = node.name.split(' ');
            const lines: string[] = [];
            let currentLine = words[0] || '';

            for (let i = 1; i < words.length; i++) {
              const testLine = currentLine + ' ' + words[i];
              const metrics = ctx.measureText(testLine);
              if (metrics.width < nodeR * 1.4) {
                currentLine = testLine;
              } else {
                lines.push(currentLine);
                currentLine = words[i];
              }
            }
            lines.push(currentLine);

            // Draw lines
            const lineHeight = fontSize * 1.2;
            const startY = nodeY - ((lines.length - 1) * lineHeight) / 2;

            for (let i = 0; i < Math.min(lines.length, 3); i++) {
              const text = i === 2 && lines.length > 3 ? '...' : lines[i];
              ctx.strokeText(text, nodeX, startY + i * lineHeight);
              ctx.fillText(text, nodeX, startY + i * lineHeight);
            }
          }
        }
      }
    }
  }, [nodes, dimensions, zoomInfo, currentNode, hoveredNode, genColor]);

  // Zoom to a node
  const zoomToNode = useCallback((node: CircleTreeNode) => {
    if (node.x === undefined || node.y === undefined || node.r === undefined) return;

    // Calculate scale to make the target node fill ~45% of the view (or more for leaves)
    const viewDiameter = Math.min(dimensions.width, dimensions.height) * 0.9;
    const zoomFactor = node.nodeType === 'role' || (node.children && node.children.length < 2) ? 2 : 1;

    setZoomInfo({
      centerX: node.x,
      centerY: node.y,
      scale: (viewDiameter / (node.r * 2)) * 0.45 * zoomFactor,
    });
    setCurrentNode(node);
  }, [dimensions]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hiddenCanvas = hiddenCanvasRef.current;
    if (!hiddenCanvas) return;

    const rect = hiddenCanvas.getBoundingClientRect();
    const scaleX = hiddenCanvas.width / rect.width;
    const scaleY = hiddenCanvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
    if (!hiddenCtx) return;

    const pixel = hiddenCtx.getImageData(mouseX, mouseY, 1, 1).data;
    const colorString = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
    const clickedNode = colorToNode.get(colorString);

    if (clickedNode) {
      if (currentNode && clickedNode.id === currentNode.id) {
        // Double-click behavior: zoom to parent
        if (currentNode.parent) {
          zoomToNode(currentNode.parent);
        } else if (nodes.length > 0) {
          zoomToNode(nodes[0]); // Zoom to root
        }
      } else {
        zoomToNode(clickedNode);
      }
    } else if (nodes.length > 0) {
      // Click on empty space: zoom to root
      zoomToNode(nodes[0]);
    }
  }, [colorToNode, currentNode, nodes, zoomToNode]);

  // Handle canvas mouse move (hover)
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hiddenCanvas = hiddenCanvasRef.current;
    if (!hiddenCanvas) return;

    const rect = hiddenCanvas.getBoundingClientRect();
    const scaleX = hiddenCanvas.width / rect.width;
    const scaleY = hiddenCanvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
    if (!hiddenCtx) return;

    const pixel = hiddenCtx.getImageData(mouseX, mouseY, 1, 1).data;
    const colorString = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
    const hovered = colorToNode.get(colorString);

    setHoveredNode(hovered || null);
  }, [colorToNode]);

  // Add new node
  const handleAddNode = useCallback(async () => {
    if (!editName.trim()) return;

    // When currentNode is null (empty state) or virtual-root, create at root level
    const parentId = !currentNode || currentNode.id === 'virtual-root' ? null : currentNode.id;

    await createCircle({
      name: editName.trim(),
      parentId,
      nodeType: editNodeType,
      color: editNodeType === 'role' ? editColor : undefined,
      description: editDescription || undefined,
    });

    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    refreshVisualization();
  }, [editName, editNodeType, editColor, editDescription, currentNode, createCircle, refreshVisualization]);

  // Edit current node
  const handleEditNode = useCallback(async () => {
    if (!editName.trim() || !currentNode || currentNode.id === 'virtual-root') return;

    await updateCircle(currentNode.id, {
      name: editName.trim(),
      nodeType: editNodeType,
      color: editNodeType === 'role' ? editColor : undefined,
      description: editDescription || undefined,
    });

    setEditDialogOpen(false);
    refreshVisualization();
  }, [editName, editNodeType, editColor, editDescription, currentNode, updateCircle, refreshVisualization]);

  // Delete current node
  const handleDeleteNode = useCallback(async () => {
    if (!currentNode || currentNode.id === 'virtual-root') return;

    if (confirm(`Delete "${currentNode.name}" and all its children?`)) {
      const parentNode = currentNode.parent;
      await deleteCircle(currentNode.id);

      if (parentNode) {
        setCurrentNode(parentNode);
      }
      refreshVisualization();
    }
  }, [currentNode, deleteCircle, refreshVisualization]);

  // Move current node
  const handleMoveNode = useCallback(async () => {
    if (!currentNode || currentNode.id === 'virtual-root' || moveTargetId === undefined) return;

    await updateCircle(currentNode.id, {
      parentId: moveTargetId,
    });

    setMoveDialogOpen(false);
    setMoveTargetId(null);
    refreshVisualization();
  }, [currentNode, moveTargetId, updateCircle, refreshVisualization]);

  // Open add dialog
  const openAddDialog = useCallback(() => {
    setEditMode('add');
    setEditName('');
    setEditNodeType('role');
    setEditColor('#FFCC00');
    setEditDescription('');
    setEditDialogOpen(true);
  }, []);

  // Open edit dialog
  const openEditDialog = useCallback(() => {
    if (!currentNode || currentNode.id === 'virtual-root') return;

    setEditMode('edit');
    setEditName(currentNode.name);
    setEditNodeType(currentNode.nodeType);
    setEditColor(currentNode.color || '#FFCC00');
    setEditDescription(currentNode.description || '');
    setEditDialogOpen(true);
  }, [currentNode]);

  // Open move dialog
  const openMoveDialog = useCallback(() => {
    if (!currentNode || currentNode.id === 'virtual-root') return;
    setMoveTargetId(currentNode.parent?.id || null);
    setMoveDialogOpen(true);
  }, [currentNode]);

  // Toggle tree node expansion
  const toggleTreeNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Handle tree node selection - zoom to the node in the circle view
  const handleTreeNodeSelect = useCallback((node: CircleTreeNode) => {
    // Find the node in the packed nodes array (it has the x, y, r coordinates)
    const packedNode = nodes.find(n => n.id === node.id);
    if (packedNode) {
      zoomToNode(packedNode);
    }
  }, [nodes, zoomToNode]);

  // Get tree data for the panel (use the first node as root)
  const getTreeRoot = useCallback((): CircleTreeNode | null => {
    if (nodes.length === 0) return null;
    return nodes[0]; // The packed tree root
  }, [nodes]);

  // Auto-expand parent nodes when current node changes
  useEffect(() => {
    if (currentNode) {
      // Expand all ancestors
      const newExpanded = new Set(expandedNodes);
      let node: CircleTreeNode | null = currentNode.parent || null;
      while (node) {
        newExpanded.add(node.id);
        node = node.parent || null;
      }
      setExpandedNodes(newExpanded);
    }
  }, [currentNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize on mount
  useEffect(() => {
    loadCircles();
  }, [loadCircles]);

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Rebuild tree when circles or dimensions change
  useEffect(() => {
    refreshVisualization();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshVisualization is memoized, we only want to run on circles/dimensions changes
  }, [circles, dimensions.width, dimensions.height]);

  // Update zoom when nodes change (including dimension changes that rebuild nodes)
  useEffect(() => {
    if (nodes.length > 0) {
      const root = nodes[0];
      if (root.x !== undefined && root.y !== undefined && root.r) {
        // Always recenter on root when nodes are rebuilt
        setZoomInfo(prev => {
          // Only update if targeting root or first time
          if (prev.centerX === 0 && prev.centerY === 0) {
            return {
              centerX: root.x!,
              centerY: root.y!,
              scale: 1,
            };
          }
          // If already zoomed to a specific node, update that node's position
          const targetNode = currentNode && nodes.find(n => n.id === currentNode.id);
          if (targetNode && targetNode.x !== undefined && targetNode.y !== undefined) {
            return {
              ...prev,
              centerX: targetNode.x,
              centerY: targetNode.y,
            };
          }
          return {
            centerX: root.x!,
            centerY: root.y!,
            scale: 1,
          };
        });
        if (!currentNode) {
          setCurrentNode(root);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Draw canvases when state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const hiddenCanvas = hiddenCanvasRef.current;
    if (!canvas || !hiddenCanvas) return;

    const ctx = canvas.getContext('2d');
    const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !hiddenCtx) return;

    drawCanvas(ctx, false);
    drawCanvas(hiddenCtx, true);
  }, [drawCanvas]);

  // Get available parent options for move dialog
  const getMoveTargetOptions = useCallback(() => {
    if (!currentNode) return [];

    // Build set of descendant IDs to exclude
    const excludeIds = new Set<string>();
    const collectDescendants = (nodeId: string) => {
      excludeIds.add(nodeId);
      circles
        .filter(c => c.parentId === nodeId)
        .forEach(c => collectDescendants(c.id));
    };
    collectDescendants(currentNode.id);

    // Return all circles except current and its descendants
    return circles.filter(c => !excludeIds.has(c.id) && c.nodeType !== 'role');
  }, [currentNode, circles]);

  return (
    <div style={{ height: 'calc(100vh - 200px)', width: '100%', overflow: 'hidden' }}>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-4">
            <CardTitle>Circles View</CardTitle>
            {currentNode && currentNode.id !== 'virtual-root' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => nodes.length > 0 && zoomToNode(nodes[0])}
                >
                  <Home className="w-4 h-4" />
                </Button>
                <span>/</span>
                <span className="font-medium">{currentNode.name}</span>
                <span className="text-xs">({currentNode.nodeType})</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTreePanelOpen(!treePanelOpen)}
              title={treePanelOpen ? 'Hide tree panel' : 'Show tree panel'}
            >
              {treePanelOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeft className="w-4 h-4" />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openEditDialog}
              disabled={!currentNode || currentNode.id === 'virtual-root'}
            >
              <Edit className="w-4 h-4 mr-1" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openMoveDialog}
              disabled={!currentNode || currentNode.id === 'virtual-root'}
            >
              <Move className="w-4 h-4 mr-1" /> Move
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteNode}
              disabled={!currentNode || currentNode.id === 'virtual-root'}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden p-0">
          {circles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-2">
              <p className="mb-4">No circles yet. Create your first organization!</p>
              <Button onClick={openAddDialog}>
                <Plus className="w-4 h-4 mr-2" /> Create Organization
              </Button>
            </div>
          ) : (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              {/* Tree Panel */}
              {treePanelOpen && (
                <>
                  <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
                    <div className="h-full border-r bg-muted/30">
                      <div className="p-2 border-b bg-muted/50">
                        <h3 className="text-sm font-medium text-muted-foreground">Organization Tree</h3>
                      </div>
                      <ScrollArea className="h-[calc(100%-37px)]">
                        <div className="p-1">
                          {getTreeRoot() && (
                            <TreeNodeItem
                              node={getTreeRoot()!}
                              currentNodeId={currentNode?.id || null}
                              expandedNodes={expandedNodes}
                              onToggle={toggleTreeNode}
                              onSelect={handleTreeNodeSelect}
                              depth={0}
                            />
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                </>
              )}
              {/* Circle Canvas Panel */}
              <ResizablePanel defaultSize={treePanelOpen ? 75 : 100}>
                <div className="relative w-full h-full p-2" ref={containerRef}>
                  <canvas
                    ref={canvasRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    className="cursor-pointer"
                    onClick={handleCanvasClick}
                    onMouseMove={handleCanvasMouseMove}
                    style={{ width: '100%', height: '100%' }}
                  />
                  <canvas
                    ref={hiddenCanvasRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    style={{ display: 'none' }}
                  />
                  {hoveredNode && (
                    <div
                      className="absolute bg-black/75 text-white px-2 py-1 rounded text-sm pointer-events-none"
                      style={{
                        left: '50%',
                        bottom: '10px',
                        transform: 'translateX(-50%)'
                      }}
                    >
                      {hoveredNode.name}
                      {hoveredNode.description && (
                        <span className="text-gray-300 ml-2">- {hoveredNode.description}</span>
                      )}
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </CardContent>

        {/* Add/Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editMode === 'add' ? 'Add Node' : 'Edit Node'}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter name..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Select value={editNodeType} onValueChange={(v) => setEditNodeType(v as CircleNodeType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organization">Organization</SelectItem>
                    <SelectItem value="circle">Circle</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="role">Role</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editNodeType === 'role' && (
                <div className="grid gap-2">
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-10 w-20"
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional description..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={editMode === 'add' ? handleAddNode : handleEditNode}>
                {editMode === 'add' ? 'Add' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Move Dialog */}
        <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move "{currentNode?.name}"</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="target">New Parent</Label>
                <Select
                  value={moveTargetId || 'none'}
                  onValueChange={(v) => setMoveTargetId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Parent (Root)</SelectItem>
                    {getMoveTargetOptions().map(circle => (
                      <SelectItem key={circle.id} value={circle.id}>
                        {circle.name} ({circle.nodeType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleMoveNode}>
                Move
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
};

export default CirclesView;
