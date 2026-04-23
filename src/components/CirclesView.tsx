import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useCircles, CircleTreeNode } from '@/hooks/useCircles';
import { CircleNodeType, RoleAssignment, RoleInvolvementType } from '@/lib/persistence-types';
import { UserAvatar } from '@/components/UserAvatar';
import { useUsers, UserWithTrigram } from '@/hooks/useUsers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Badge } from '@/components/ui/badge';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  users: UserWithTrigram[];
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({
  node,
  currentNodeId,
  expandedNodes,
  onToggle,
  onSelect,
  depth,
  users,
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
              users={users}
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

  // Determine which nodes have visible text labels (same rule as canvas Pass 1).
  // We reuse this to gate overlay badges so they appear only when the role title is visible.
  const visibleTextNodeIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (!currentNode) return ids;
    for (const node of nodes) {
      if (node.x === undefined || node.y === undefined || node.r === undefined) continue;
      const nodeR =
        node.r * zoomInfo.scale * (node.nodeType === 'role' ? 0.9 : 1);
      const showText =
        node.id === currentNode.id ||
        node.parent?.id === currentNode.id ||
        node.id === currentNode.parent?.id ||
        node.parent?.id === currentNode.parent?.id;
      if (showText && nodeR > 15) {
        const fontSize = Math.min(Math.round(nodeR / 4), 24);
        if (fontSize >= 8) ids.add(node.id);
      }
    }
    return ids;
  }, [nodes, zoomInfo, currentNode]);

  // Compute visible role assignment overlays for the canvas
  const visibleAssignmentNodes = React.useMemo(() => {
    const result: { node: CircleTreeNode; screenX: number; screenY: number; nodeR: number }[] = [];
    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    for (const node of nodes) {
      if (
        node.nodeType !== 'role' ||
        !node.assignments ||
        node.assignments.length === 0 ||
        node.x === undefined ||
        node.y === undefined ||
        node.r === undefined ||
        !visibleTextNodeIds.has(node.id)
      )
        continue;
      const nodeR = node.r * zoomInfo.scale * 0.9;
      const screenX = (node.x - zoomInfo.centerX) * zoomInfo.scale + centerX;
      const screenY = (node.y - zoomInfo.centerY) * zoomInfo.scale + centerY;
      result.push({ node, screenX, screenY, nodeR });
    }
    return result;
  }, [nodes, zoomInfo, dimensions, visibleTextNodeIds]);

  // Refs for native event listeners (avoid stale closures)
  const zoomInfoRef = useRef(zoomInfo);
  zoomInfoRef.current = zoomInfo;
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;
  const colorToNodeRef = useRef<Map<string, CircleTreeNode>>(new Map());
  colorToNodeRef.current = colorToNode;
  const nodesRef = useRef<CircleTreeNode[]>([]);
  nodesRef.current = nodes;

  // Animation state for smooth zoom transitions
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  // Ref to track currentNode for use in callbacks without stale closure
  const currentNodeRef = useRef<CircleTreeNode | null>(null);

  const { users } = useUsers();

  // Involvement labels
  const INVOLVEMENT_OPTIONS: { value: RoleInvolvementType; label: string }[] = [
    { value: 'P', label: 'PILOT / DRI (P)' },
    { value: 'CP', label: 'COPILOT (CP)' },
    { value: 'PA', label: 'PARTICIPANT (PA)' },
    { value: 'F', label: 'FOCUS (F)' },
    { value: 'A', label: 'APPRENTICE (A)' },
    { value: 'R', label: 'RESOURCE (R)' },
  ];

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<'add' | 'edit'>('add');
  const [editName, setEditName] = useState('');
  const [editNodeType, setEditNodeType] = useState<CircleNodeType>('role');
  const [editColor, setEditColor] = useState('#FFCC00');
  const [editDescription, setEditDescription] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editDomains, setEditDomains] = useState('');
  const [editAccountabilities, setEditAccountabilities] = useState('');
  const [editAssignments, setEditAssignments] = useState<RoleAssignment[]>([]);

  // Move dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

    if (packedNodes.length === 0) {
      setCurrentNode(null);
      return;
    }

    // Use ref to access current node without stale closure
    const currentNodeValue = currentNodeRef.current;

    // If we have a currentNode selected, find it in the new tree and update with fresh data
    if (currentNodeValue && currentNodeValue.id !== 'virtual-root') {
      const updatedNode = packedNodes.find(n => n.id === currentNodeValue.id);
      if (updatedNode) {
        setCurrentNode(updatedNode);
      } else if (packedNodes.length > 0) {
        // Node was deleted, select root
        setCurrentNode(packedNodes[0]);
      }
    } else if (packedNodes.length > 0 && !currentNodeValue) {
      setCurrentNode(packedNodes[0]);
    }

    // Reset color mapping
    colorIndex.current = 1;
    setColorToNode(new Map());
  }, [buildPackedTree]);

  // Draw the canvas
  const drawCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    hidden: boolean = false
  ) => {
    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    const newColorMap = new Map<string, CircleTreeNode>();

    // Reset color index at the start of hidden canvas drawing to ensure consistent mapping
    if (hidden) {
      colorIndex.current = 1;
    }

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

    // Draw text labels (visible canvas only) with float/center based on actual child text visibility
    if (!hidden) {
      /* Pass 1: which node names actually render at current zoom? */
      const textNodeIds = new Set<string>();
      for (const node of nodes) {
        if (node.x === undefined || node.y === undefined || node.r === undefined) continue;
        const nodeR = node.r * zoomInfo.scale * (node.nodeType === 'role' ? 0.9 : 1);
        const showText = currentNode && (
          node.id === currentNode.id ||
          node.parent?.id === currentNode.id ||
          node.id === currentNode.parent?.id ||
          node.parent?.id === currentNode.parent?.id
        );
        if (showText && nodeR > 15) { // LOWERED from 20 → 15 for closer trigger
          const fontSize = Math.min(Math.round(nodeR / 4), 24);
          if (fontSize >= 8) textNodeIds.add(node.id);
        }
      }

      /* Pass 2: containers with a visible child → float title above */
      const hasVisibleTextChild = new Set<string>();
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            if (textNodeIds.has(child.id)) { hasVisibleTextChild.add(node.id); break; }
          }
        }
      }

      /* Pass 3: draw text */
      for (const node of nodes) {
        if (node.x === undefined || node.y === undefined || node.r === undefined) continue;
        if (!textNodeIds.has(node.id)) continue;

        const nodeX = ((node.x - zoomInfo.centerX) * zoomInfo.scale) + centerX;
        const nodeY = ((node.y - zoomInfo.centerY) * zoomInfo.scale) + centerY;
        const nodeR = node.r * zoomInfo.scale * (node.nodeType === 'role' ? 0.9 : 1);
        const fontSize = Math.min(Math.round(nodeR / 4), 24);

        if (fontSize < 8) continue;

        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';

        if (node.nodeType === 'role') {
          ctx.fillStyle = '#000000';
          ctx.strokeStyle = '#FFFFFF';
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#000000';
        }

        const words = node.name.split(' ');
        const lines: string[] = [];
        let cur = words[0] || '';
        for (let i = 1; i < words.length; i++) {
          const test = cur + ' ' + words[i];
          if (ctx.measureText(test).width < nodeR * 1.4) { cur = test; } else { lines.push(cur); cur = words[i]; }
        }
        lines.push(cur);

        const lh = fontSize * 1.2;
        const maxLines = Math.min(lines.length, 3);

        if (hasVisibleTextChild.has(node.id)) {
          // Float above so children are unobstructed
          ctx.textBaseline = 'top';
          const block = maxLines * lh;
          const startY = nodeY - nodeR - block - 4;
          for (let i = 0; i < maxLines; i++) {
            const txt = i === 2 && lines.length > 3 ? '...' : lines[i];
            ctx.strokeText(txt, nodeX, startY + i * lh);
            ctx.fillText(txt, nodeX, startY + i * lh);
          }
        } else {
          // Center inside (leaf or zoomed-out parent)
          ctx.textBaseline = 'middle';
          const startY = nodeY - ((maxLines - 1) * lh) / 2;
          for (let i = 0; i < maxLines; i++) {
            const txt = i === 2 && lines.length > 3 ? '...' : lines[i];
            ctx.strokeText(txt, nodeX, startY + i * lh);
            ctx.fillText(txt, nodeX, startY + i * lh);
          }
        }
      }
    }
  }, [nodes, dimensions, zoomInfo, currentNode, hoveredNode, genColor]);

  // Cubic in-out easing function
  const easeInOutCubic = (t: number): number => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Direct cubic-ease interpolation (no d3.interpolateZoom orbit artifact)
  const zoomToNode = useCallback((node: CircleTreeNode) => {
    if (node.x === undefined || node.y === undefined || node.r === undefined) return;

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const viewDiameter = Math.min(dimensions.width, dimensions.height) * 0.9;
    const zoomFactor = node.nodeType === 'role' || (node.children && node.children.length < 2) ? 2 : 1;
    const s = (viewDiameter / (node.r * 2)) * 0.45 * zoomFactor;

    const from = zoomInfoRef.current; // read latest at call time
    const DURATION = 500;

    setIsAnimating(true);
    setCurrentNode(node);

    const t0 = performance.now();
    const ease = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const tick = (now: number) => {
      const raw = Math.min((now - t0) / DURATION, 1);
      const e = ease(raw);
      setZoomInfo({
        centerX: from.centerX + (node.x! - from.centerX) * e,
        centerY: from.centerY + (node.y! - from.centerY) * e,
        scale: from.scale + (s - from.scale) * e,
      });
      if (raw < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        setIsAnimating(false);
        animationRef.current = null;
      }
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [dimensions.width, dimensions.height]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hiddenCanvas = hiddenCanvasRef.current;
    const visibleCanvas = canvasRef.current;
    if (!hiddenCanvas || !visibleCanvas) return;

    // Use visible canvas rect for mouse coordinates (hidden canvas has display:none so its rect is zero)
    const rect = visibleCanvas.getBoundingClientRect();
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

  /* -- Unified native canvas listeners (wheel + drag-pan + click/hover) -- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const hiddenCanvas = hiddenCanvasRef.current;
    if (!canvas || !hiddenCanvas) return;

    let isDragging = false;
    let pointerDown: { x: number; y: number } | null = null;
    const DRAG_THRESHOLD = 4;

    /* Wheel zoom */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { width, height } = dimensionsRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = width / 2;
      const cy = height / 2;

      const cur = zoomInfoRef.current;
      const factor = 1 - e.deltaY * 0.001;
      const s = Math.min(Math.max(cur.scale * factor, 0.05), 20);
      if (s === cur.scale) return;

      const worldX = cur.centerX + (mx - cx) / cur.scale;
      const worldY = cur.centerY + (my - cy) / cur.scale;
      setZoomInfo({
        centerX: worldX - (mx - cx) / s,
        centerY: worldY - (my - cy) / s,
        scale: s,
      });

      // Auto-focus on whatever container/role is now under the cursor after zoom
      let deepest: CircleTreeNode | null = null;
      let bestDepth = -1;
      for (const n of nodesRef.current) {
        if (n.x === undefined || n.y === undefined || n.r === undefined) continue;
        const dx = n.x - worldX;
        const dy = n.y - worldY;
        if (dx * dx + dy * dy <= n.r * n.r) {
          if ((n.depth ?? 0) > bestDepth) {
            bestDepth = n.depth ?? 0;
            deepest = n;
          }
        }
      }
      if (deepest) {
        setCurrentNode(deepest);
      }
    };

    /* Drag pan */
    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerDown = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      isDragging = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = hiddenCanvas.width / rect.width;
      const scaleY = hiddenCanvas.height / rect.height;
      const mX = (e.clientX - rect.left) * scaleX;
      const mY = (e.clientY - rect.top) * scaleY;

      if (pointerDown && e.buttons === 1) {
        const dx = (e.clientX - rect.left) - pointerDown.x;
        const dy = (e.clientY - rect.top) - pointerDown.y;
        if (!isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
          isDragging = true;
        }
        if (isDragging) {
          const cur = zoomInfoRef.current;
          setZoomInfo(prev => ({
            ...prev,
            centerX: prev.centerX - e.movementX / cur.scale,
            centerY: prev.centerY - e.movementY / cur.scale,
          }));
        }
      }

      // Hover detection when not dragging
      if (!isDragging) {
        const hc = hiddenCanvas.getContext('2d', { willReadFrequently: true });
        if (!hc) return;
        const px = hc.getImageData(mX, mY, 1, 1).data;
        const color = `rgb(${px[0]},${px[1]},${px[2]})`;
        const hovered = colorToNodeRef.current.get(color);
        setHoveredNode(hovered || null);
      }
    };

    /* Click-to-focus (only when not dragging) */
    const onMouseUp = (e: MouseEvent) => {
      const wasDragging = isDragging;
      pointerDown = null;
      isDragging = false;
      if (wasDragging) return;

      const rect = canvas.getBoundingClientRect();
      const sX = hiddenCanvas.width / rect.width;
      const sY = hiddenCanvas.height / rect.height;
      const mx = (e.clientX - rect.left) * sX;
      const my = (e.clientY - rect.top) * sY;
      const hc = hiddenCanvas.getContext('2d', { willReadFrequently: true });
      if (!hc) return;
      const px = hc.getImageData(mx, my, 1, 1).data;
      const color = `rgb(${px[0]},${px[1]},${px[2]})`;
      const clicked = colorToNodeRef.current.get(color);

      if (clicked) {
        const cn = currentNodeRef.current;
        if (cn && clicked.id === cn.id && cn.parent) {
          zoomToNode(cn.parent);
        } else {
          zoomToNode(clicked);
        }
      } else if (nodesRef.current.length > 0) {
        zoomToNode(nodesRef.current[0]);
      }
    };

    const onLeave = () => { pointerDown = null; isDragging = false; };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []); // refs + zoomToNode bridge mutable state


  const handleAddNode = useCallback(async () => {
    if (!editName.trim()) return;

    // When currentNode is null (empty state), virtual-root, no circles exist, or adding an organization, create at root level
    // Organizations should always be at root level
    const shouldBeRoot = !currentNode || currentNode.id === 'virtual-root' || circles.length === 0 || editNodeType === 'organization';
    const parentId = shouldBeRoot ? null : currentNode.id;

    await createCircle({
      name: editName.trim(),
      parentId,
      nodeType: editNodeType,
      color: editNodeType === 'role' ? editColor : undefined,
      description: editDescription || undefined,
      purpose: editPurpose || undefined,
      domains: editDomains || undefined,
      accountabilities: editAccountabilities || undefined,
      assignments: editNodeType === 'role' ? editAssignments : undefined,
    });

    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    setEditPurpose('');
    setEditDomains('');
    setEditAccountabilities('');
    setEditAssignments([]);
    // Note: refreshVisualization is called automatically by useEffect watching circles, 
    // but calling it manually ensures immediate update on the current client
    refreshVisualization();
  }, [editName, editNodeType, editColor, editDescription, editPurpose, editDomains, editAccountabilities, editAssignments, currentNode, circles, createCircle, refreshVisualization]);

  // Edit current node
  const handleEditNode = useCallback(async () => {
    if (!editName.trim() || !currentNode || currentNode.id === 'virtual-root') return;

    await updateCircle(currentNode.id, {
      name: editName.trim(),
      nodeType: editNodeType,
      color: editNodeType === 'role' ? editColor : undefined,
      description: editDescription || undefined,
      purpose: editPurpose || undefined,
      domains: editDomains || undefined,
      accountabilities: editAccountabilities || undefined,
      assignments: editNodeType === 'role' ? editAssignments : undefined,
    });

    setEditDialogOpen(false);
    // Note: refreshVisualization is called automatically by useEffect watching circles,
    // but calling it manually ensures immediate update on the current client
    refreshVisualization();
  }, [editName, editNodeType, editColor, editDescription, editPurpose, editDomains, editAccountabilities, editAssignments, currentNode, updateCircle, refreshVisualization]);

  // Open delete dialog
  const handleDeleteNode = useCallback(() => {
    console.log('[DEBUG] handleDeleteNode called. currentNode:', currentNode);
    if (!currentNode || currentNode.id === 'virtual-root') {
      console.log('[DEBUG] handleDeleteNode aborted: null or virtual-root');
      return;
    }
    setDeleteDialogOpen(true);
  }, [currentNode]);

  // Confirm delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!currentNode || currentNode.id === 'virtual-root') return;

    console.log('[DEBUG] Confirmed delete via Dialog. Calling deleteCircle with id:', currentNode.id);
    const parentNode = currentNode.parent;
    await deleteCircle(currentNode.id);

    if (parentNode) {
      setCurrentNode(parentNode);
    } else {
      setCurrentNode(null);
    }
    // Note: refreshVisualization is called automatically by useEffect watching circles,
    // but calling it manually ensures immediate update on the current client
    refreshVisualization();
    setDeleteDialogOpen(false);
  }, [currentNode, deleteCircle, refreshVisualization]);

  // Move current node
  const handleMoveNode = useCallback(async () => {
    if (!currentNode || currentNode.id === 'virtual-root' || moveTargetId === undefined) return;

    await updateCircle(currentNode.id, {
      parentId: moveTargetId,
    });

    setMoveDialogOpen(false);
    setMoveTargetId(null);
    // Note: refreshVisualization is called automatically by useEffect watching circles,
    // but calling it manually ensures immediate update on the current client
    refreshVisualization();
  }, [currentNode, moveTargetId, updateCircle, refreshVisualization]);

  // Open add dialog
  const openAddDialog = useCallback(() => {
    setEditMode('add');
    setEditName('');
    // Default to organization if no circles exist, otherwise role
    setEditNodeType(circles.length === 0 ? 'organization' : 'role');
    setEditColor('#FFCC00');
    setEditDescription('');
    setEditPurpose('');
    setEditDomains('');
    setEditAccountabilities('');
    setEditAssignments([]);
    setEditDialogOpen(true);
  }, [circles.length]);

  // Open edit dialog
  const openEditDialog = useCallback(() => {
    if (!currentNode || currentNode.id === 'virtual-root') return;

    setEditMode('edit');
    setEditName(currentNode.name);
    setEditNodeType(currentNode.nodeType);
    setEditColor(currentNode.color || '#FFCC00');
    setEditDescription(currentNode.description || '');
    setEditPurpose(currentNode.purpose || '');
    setEditDomains(currentNode.domains || '');
    setEditAccountabilities(currentNode.accountabilities || '');
    setEditAssignments(currentNode.assignments ? [...currentNode.assignments] : []);
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

  // Keep currentNodeRef in sync with currentNode for use in callbacks without stale closure
  useEffect(() => {
    currentNodeRef.current = currentNode;
  }, [currentNode]);

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

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Handle resize - use ResizeObserver to detect panel and window resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    // Initial dimensions
    updateDimensions();

    // ResizeObserver detects all size changes (window resize, panel resize, etc.)
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
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
            // If tracking root, ensure we see the whole thing (reset scale to 1)
            // Otherwise maintain current zoom level
            const isRoot = targetNode.id === root.id;

            return {
              ...prev,
              centerX: targetNode.x,
              centerY: targetNode.y,
              scale: isRoot ? 1 : prev.scale,
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
    <div style={{ height: 'calc(100vh - 240px)', width: '100%', overflow: 'hidden' }}>
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
                    <div className="h-full border-r bg-muted/30 flex flex-col">
                      <div className="p-2 border-b bg-muted/50">
                        <h3 className="text-sm font-medium text-muted-foreground">Organization Tree</h3>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-1">
                          {getTreeRoot() && (
                            <TreeNodeItem
                              node={getTreeRoot()!}
                              currentNodeId={currentNode?.id || null}
                              expandedNodes={expandedNodes}
                              onToggle={toggleTreeNode}
                              onSelect={handleTreeNodeSelect}
                              depth={0}
                              users={users}
                            />
                          )}
                        </div>
                      </ScrollArea>
                      {/* Node Detail Section */}
                      {currentNode && currentNode.id !== 'virtual-root' && (
                        <div className="border-t bg-background p-3 max-h-[40%] overflow-auto">
                          <h4 className="font-semibold text-base mb-2">{currentNode.name}</h4>
                          {/* Purpose, domains, and accountabilities are only for roles */}
                          {currentNode.nodeType === 'role' && (
                            <>
                              {currentNode.purpose && (
                                <div className="mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">Purpose:</span>
                                  <p className="text-sm whitespace-pre-wrap">{currentNode.purpose}</p>
                                </div>
                              )}
                              {currentNode.domains && (
                                <div className="mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">Domains:</span>
                                  <p className="text-sm whitespace-pre-wrap">{currentNode.domains}</p>
                                </div>
                              )}
                              {currentNode.accountabilities && (
                                <div className="mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">Accountabilities:</span>
                                  <p className="text-sm whitespace-pre-wrap">{currentNode.accountabilities}</p>
                                </div>
                              )}
                              {currentNode.assignments && currentNode.assignments.length > 0 && (
                                <div className="mb-2">
                                  <span className="text-xs font-medium text-muted-foreground">Assigned Users:</span>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {currentNode.assignments.map((assignment, index) => {
                                      const assignedUser = users.find(u => u.userId === assignment.userId);
                                      if (!assignedUser) return null;
                                      return (
                                        <div key={`${assignment.userId}-${index}`} className="flex items-center gap-1 bg-muted/50 rounded-full pl-1 pr-2 py-0.5">
                                          <UserAvatar
                                            username={assignedUser.username}
                                            logo={assignedUser.logo}
                                            size="sm"
                                            showTooltip={true}
                                            trigram={assignedUser.trigram}
                                          />
                                          <span className="text-xs font-medium">{assignment.involvementType}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          {currentNode.description && (
                            <div className="mb-2">
                              <span className="text-xs font-medium text-muted-foreground">Description:</span>
                              <p className="text-sm whitespace-pre-wrap">{currentNode.description}</p>
                            </div>
                          )}
                          {currentNode.nodeType === 'role' && !currentNode.purpose && !currentNode.domains && !currentNode.accountabilities && !currentNode.description && (!currentNode.assignments || currentNode.assignments.length === 0) && (
                            <p className="text-sm text-muted-foreground italic">No details defined. Click Edit to add.</p>
                          )}
                          {currentNode.nodeType !== 'role' && !currentNode.description && (
                            <p className="text-sm text-muted-foreground italic">No description defined. Click Edit to add.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                </>
              )}
              {/* Circle Canvas Panel */}
              <ResizablePanel defaultSize={treePanelOpen ? 75 : 100}>
                <div className="relative w-full h-full" ref={containerRef}>
                  <canvas
                    ref={canvasRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    className="cursor-grab active:cursor-grabbing"
                    style={{
                      width: '100%',
                      height: '100%',
                      pointerEvents: isAnimating ? 'none' : 'auto',
                    }}
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
                  {/* Role assignment badges overlay */}
                  {visibleAssignmentNodes.map((item) => {
                    const { node, screenX, screenY, nodeR } = item;
                    const top = screenY - nodeR - 2;
                    return (
                      <div
                        key={`badge-${node.id}`}
                        className="absolute pointer-events-none"
                        style={{
                          left: screenX,
                          top,
                          transform: 'translate(-50%, -100%)',
                        }}
                      >
                        <div className="flex -space-x-1">
                          {node.assignments!.map((assignment, idx) => {
                            const u = users.find((usr) => usr.userId === assignment.userId);
                            if (!u) return null;
                            return (
                              <div
                                key={`${node.id}-${assignment.userId}-${idx}`}
                                className="relative inline-block"
                              >
                                <UserAvatar
                                  username={u.username}
                                  logo={u.logo}
                                  size="lg"
                                  showTooltip={false}
                                  trigram={u.trigram}
                                  className="ring-2 ring-white"
                                />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[14px] font-bold px-1 rounded leading-none">
                                  {assignment.involvementType}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
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
              {/* Purpose, domains, accountabilities, and assignments are only for roles */}
              {editNodeType === 'role' && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="purpose">Purpose</Label>
                    <Textarea
                      id="purpose"
                      value={editPurpose}
                      onChange={(e) => setEditPurpose(e.target.value)}
                      placeholder="What is this role's reason for being?"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="domains">Domains of Authority</Label>
                    <Textarea
                      id="domains"
                      value={editDomains}
                      onChange={(e) => setEditDomains(e.target.value)}
                      placeholder="What does this role have control over?"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="accountabilities">Accountabilities</Label>
                    <Textarea
                      id="accountabilities"
                      value={editAccountabilities}
                      onChange={(e) => setEditAccountabilities(e.target.value)}
                      placeholder="What is expected from this role?"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Role Assignments</Label>
                    <div className="space-y-2">
                      {editAssignments.map((assignment, index) => {
                        const assignedUser = users.find(u => u.userId === assignment.userId);
                        return (
                          <div key={`${assignment.userId}-${index}`} className="flex items-center gap-2">
                            <Select
                              value={assignment.userId}
                              onValueChange={(val) => {
                                const next = [...editAssignments];
                                next[index] = { ...next[index], userId: val };
                                setEditAssignments(next);
                              }}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select user...">
                                  {assignedUser ? (
                                    <div className="flex items-center gap-2">
                                      <UserAvatar
                                        username={assignedUser.username}
                                        logo={assignedUser.logo}
                                        size="sm"
                                        showTooltip={false}
                                        trigram={assignedUser.trigram}
                                      />
                                      <span className="text-sm">{assignedUser.username}</span>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">Select user...</span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {users.map((u) => (
                                  <SelectItem key={u.userId} value={u.userId}>
                                    <div className="flex items-center gap-2">
                                      <UserAvatar
                                        username={u.username}
                                        logo={u.logo}
                                        size="sm"
                                        showTooltip={false}
                                        trigram={u.trigram}
                                      />
                                      <span className="text-sm">{u.username}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={assignment.involvementType}
                              onValueChange={(val) => {
                                const next = [...editAssignments];
                                next[index] = { ...next[index], involvementType: val as RoleInvolvementType };
                                setEditAssignments(next);
                              }}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INVOLVEMENT_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => {
                                const next = [...editAssignments];
                                next.splice(index, 1);
                                setEditAssignments(next);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditAssignments([...editAssignments, { userId: '', involvementType: 'P' }])}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add User Assignment
                      </Button>
                    </div>
                  </div>
                </>
              )}
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

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{currentNode?.name}" and all its child circles/roles.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
