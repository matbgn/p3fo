import * as React from "react";
import { eventBus } from "@/lib/events";
import { CircleEntity, CircleNodeType, CircleNodeModifier } from "@/lib/persistence-types";
import { doc, isCollaborationEnabled, initializeCollaboration, yCircles } from "@/lib/collaboration";

// Module-level state for circles
let circles: CircleEntity[] = [];

// Sync circles to Yjs for real-time collaboration
const syncCirclesToYjs = () => {
  // Try to initialize if not already enabled (e.g. after HMR or lazy load)
  if (!isCollaborationEnabled()) {
    initializeCollaboration();
  }

  if (!isCollaborationEnabled()) return;
  doc.transact(() => {
    const currentIds = Array.from(yCircles.keys()) as string[];
    const newIds = circles.map(c => c.id);
    // Remove deleted circles
    currentIds.forEach(id => {
      if (!newIds.includes(id)) {
        yCircles.delete(id);
      }
    });
    // Add/update circles
    circles.forEach(circle => {
      const existing = yCircles.get(circle.id) as CircleEntity | undefined;
      if (!existing || JSON.stringify(existing) !== JSON.stringify(circle)) {
        yCircles.set(circle.id, circle);
      }
    });
  });
};

// Helper to convert raw API response to CircleEntity with proper types
const parseCircleEntity = (data: unknown): CircleEntity => {
  const raw = data as Record<string, unknown>;
  return {
    id: raw.id as string,
    name: raw.name as string,
    parentId: (raw.parentId as string) || null,
    nodeType: raw.nodeType as CircleNodeType,
    modifier: raw.modifier as CircleNodeModifier | undefined,
    color: raw.color as string | undefined,
    size: raw.size as number | undefined,
    description: raw.description as string | undefined,
    purpose: raw.purpose as string | undefined,
    domains: raw.domains as string | undefined,
    accountabilities: raw.accountabilities as string | undefined,
    order: raw.order as number | undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
  };
};

// Load circles from the API
const loadCircles = async (): Promise<CircleEntity[]> => {
  try {
    // Check if Yjs has data first (collaborative mode takes precedence)
    if (isCollaborationEnabled() && yCircles.size > 0) {
      circles = Array.from(yCircles.values()) as CircleEntity[];
      eventBus.publish("circlesChanged");
      return circles;
    }

    const response = await fetch("/api/circles");
    if (!response.ok) {
      throw new Error(`Failed to load circles: ${response.statusText}`);
    }
    const data = await response.json();
    circles = (data as unknown[]).map(parseCircleEntity);
    eventBus.publish("circlesChanged");
    // Sync loaded circles to Yjs for other clients
    syncCirclesToYjs();
    return circles;
  } catch (error) {
    console.error("Error loading circles:", error);
    return [];
  }
};

// Create a new circle
const createCircle = async (input: Partial<CircleEntity>): Promise<CircleEntity | null> => {
  try {
    const response = await fetch("/api/circles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`Failed to create circle: ${response.statusText}`);
    }
    const newCircle = parseCircleEntity(await response.json());
    circles = [...circles, newCircle];
    eventBus.publish("circlesChanged");
    syncCirclesToYjs();
    return newCircle;
  } catch (error) {
    console.error("Error creating circle:", error);
    return null;
  }
};

// Update an existing circle
const updateCircle = async (
  id: string,
  data: Partial<CircleEntity>
): Promise<CircleEntity | null> => {
  try {
    const response = await fetch(`/api/circles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      if (response.status === 404) {
        console.error("Circle not found:", id);
        return null;
      }
      throw new Error(`Failed to update circle: ${response.statusText}`);
    }
    const updatedCircle = parseCircleEntity(await response.json());
    circles = circles.map((c) => (c.id === id ? updatedCircle : c));
    eventBus.publish("circlesChanged");
    syncCirclesToYjs();
    return updatedCircle;
  } catch (error) {
    console.error("Error updating circle:", error);
    return null;
  }
};

// Delete a circle (and its descendants via backend recursive delete)
const deleteCircle = async (id: string): Promise<boolean> => {
  try {
    const response = await fetch(`/api/circles/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to delete circle: ${response.statusText}`);
    }
    // Remove the circle and all descendants from local state
    const idsToRemove = new Set<string>();
    const collectDescendants = (parentId: string) => {
      idsToRemove.add(parentId);
      circles
        .filter((c) => c.parentId === parentId)
        .forEach((c) => collectDescendants(c.id));
    };
    collectDescendants(id);
    circles = circles.filter((c) => !idsToRemove.has(c.id));
    eventBus.publish("circlesChanged");
    syncCirclesToYjs();
    return true;
  } catch (error) {
    console.error("Error deleting circle:", error);
    return false;
  }
};

// Clear all circles
const clearAllCircles = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/circles/clear", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Failed to clear circles: ${response.statusText}`);
    }
    circles = [];
    eventBus.publish("circlesChanged");
    syncCirclesToYjs();
    return true;
  } catch (error) {
    console.error("Error clearing circles:", error);
    return false;
  }
};

// Helper: Get root circles (no parent)
const getRootCircles = (): CircleEntity[] => {
  return circles.filter((c) => c.parentId === null);
};

// Helper: Get children of a circle
const getChildrenOf = (parentId: string): CircleEntity[] => {
  return circles.filter((c) => c.parentId === parentId);
};

// Helper: Build hierarchical tree structure for D3
export interface CircleTreeNode {
  id: string;
  name: string;
  nodeType: CircleNodeType;
  modifier?: CircleNodeModifier;
  color?: string;
  size: number;
  description?: string;
  purpose?: string;
  domains?: string;
  accountabilities?: string;
  children?: CircleTreeNode[];
  // D3 computed properties (added by pack layout)
  x?: number;
  y?: number;
  r?: number;
  depth?: number;
  parent?: CircleTreeNode | null;
}

const buildCircleTree = (parentId: string | null = null): CircleTreeNode[] => {
  const children = parentId === null ? getRootCircles() : getChildrenOf(parentId);
  return children
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((circle) => ({
      id: circle.id,
      name: circle.name,
      nodeType: circle.nodeType,
      modifier: circle.modifier,
      color: circle.color,
      size: circle.size ?? 1,
      description: circle.description,
      purpose: circle.purpose,
      domains: circle.domains,
      accountabilities: circle.accountabilities,
      children: buildCircleTree(circle.id),
    }));
};

// Initialize circles on module load
loadCircles();

/**
 * React hook for managing circles state.
 * Provides CRUD operations and hierarchical tree building for D3 visualization.
 */
export function useCircles() {
  const [, setForceRender] = React.useState({});

  // Initialize collaboration on mount
  React.useEffect(() => {
    initializeCollaboration();
  }, []);

  // Subscribe to circles changes (local eventBus)
  React.useEffect(() => {
    const onCirclesChanged = () => {
      setForceRender({});
    };
    eventBus.subscribe("circlesChanged", onCirclesChanged);
    return () => {
      eventBus.unsubscribe("circlesChanged", onCirclesChanged);
    };
  }, []);

  // Subscribe to Yjs changes (remote clients)
  React.useEffect(() => {
    if (!isCollaborationEnabled()) return;

    const observer = () => {
      // Reconstruct state from Yjs
      circles = Array.from(yCircles.values()) as CircleEntity[];
      eventBus.publish("circlesChanged");
    };

    yCircles.observe(observer);
    return () => {
      yCircles.unobserve(observer);
    };
  }, []);

  return {
    // Raw circles array
    circles,

    // CRUD operations
    loadCircles,
    createCircle,
    updateCircle,
    deleteCircle,
    clearAllCircles,

    // Hierarchy helpers
    getRootCircles,
    getChildrenOf,
    buildCircleTree,

    // Utility: Get a single circle by ID
    getCircleById: React.useCallback((id: string): CircleEntity | undefined => {
      return circles.find((c) => c.id === id);
    }, []),

    // Utility: Reparent a circle
    reparentCircle: React.useCallback(
      async (circleId: string, newParentId: string | null): Promise<boolean> => {
        // Prevent circular references
        if (circleId === newParentId) return false;

        // Check if newParentId is a descendant of circleId
        if (newParentId !== null) {
          let current = circles.find((c) => c.id === newParentId);
          while (current) {
            if (current.parentId === circleId) {
              console.error("Cannot reparent: would create circular reference");
              return false;
            }
            current = current.parentId
              ? circles.find((c) => c.id === current!.parentId)
              : undefined;
          }
        }

        const result = await updateCircle(circleId, { parentId: newParentId });
        return result !== null;
      },
      []
    ),
  };
}
