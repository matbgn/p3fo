import * as React from "react";
import { eventBus } from "@/lib/events";
import { FrameworkEntity, FrameworkType } from "@/lib/persistence-types";
import { doc, isCollaborationEnabled, initializeCollaboration, yFrameworks } from "@/lib/collaboration";
import { PERSISTENCE_CONFIG } from "@/lib/persistence-config";
import { getPersistenceAdapter } from "@/lib/persistence-factory";

let frameworks: FrameworkEntity[] = [];

const syncFrameworksToYjs = () => {
  if (!isCollaborationEnabled()) {
    initializeCollaboration();
  }
  if (!isCollaborationEnabled()) return;
  doc.transact(() => {
    const currentIds = Array.from(yFrameworks.keys()) as string[];
    const newIds = frameworks.map(f => f.id);
    currentIds.forEach(id => {
      if (!newIds.includes(id)) {
        yFrameworks.delete(id);
      }
    });
    frameworks.forEach(framework => {
      const existing = yFrameworks.get(framework.id) as FrameworkEntity | undefined;
      if (!existing || JSON.stringify(existing) !== JSON.stringify(framework)) {
        yFrameworks.set(framework.id, framework);
      }
    });
  });
};

const saveFrameworksToBrowser = async () => {
  try {
    const adapter = await getPersistenceAdapter();
    await adapter.importFrameworks(frameworks);
  } catch (error) {
    console.error("Error saving frameworks to browser persistence:", error);
  }
};

const loadFrameworks = async (frameworkType?: FrameworkType): Promise<FrameworkEntity[]> => {
  try {
    if (PERSISTENCE_CONFIG.FORCE_BROWSER) {
      const adapter = await getPersistenceAdapter();
      frameworks = await adapter.listFrameworks(frameworkType);
      eventBus.publish("frameworksChanged");
      return frameworks;
    }

    if (isCollaborationEnabled() && yFrameworks.size > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      frameworks = (Array.from(yFrameworks.values()) as any[]).map(v => {
        if (v && typeof v.toJSON === "function") return v.toJSON();
        return JSON.parse(JSON.stringify(v));
      }) as FrameworkEntity[];
      if (frameworkType) {
        frameworks = frameworks.filter(f => f.frameworkType === frameworkType);
      }
      eventBus.publish("frameworksChanged");
      return frameworks;
    }

    let url = "/api/frameworks";
    if (frameworkType) {
      url += `?frameworkType=${encodeURIComponent(frameworkType)}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load frameworks: ${response.statusText}`);
    }
    const data = await response.json();
    frameworks = data;
    eventBus.publish("frameworksChanged");
    syncFrameworksToYjs();
    return frameworks;
  } catch (error) {
    console.error("Error loading frameworks:", error);
    return [];
  }
};

const createFramework = async (input: Partial<FrameworkEntity>): Promise<FrameworkEntity | null> => {
  try {
    const now = new Date().toISOString();
    const newFramework: FrameworkEntity = {
      id: input.id || crypto.randomUUID(),
      name: input.name || "New Framework",
      frameworkType: input.frameworkType || "intentional",
      parentId: input.parentId ?? null,
      categories: input.categories || [],
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    };

    if (PERSISTENCE_CONFIG.FORCE_BROWSER) {
      frameworks = [...frameworks, newFramework];
      eventBus.publish("frameworksChanged");
      await saveFrameworksToBrowser();
      return newFramework;
    }

    const response = await fetch("/api/frameworks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newFramework),
    });
    if (!response.ok) {
      throw new Error(`Failed to create framework: ${response.statusText}`);
    }
    const created = await response.json();
    frameworks = [...frameworks, created];
    eventBus.publish("frameworksChanged");
    syncFrameworksToYjs();
    return created;
  } catch (error) {
    console.error("Error creating framework:", error);
    return null;
  }
};

const updateFramework = async (
  id: string,
  data: Partial<FrameworkEntity>
): Promise<FrameworkEntity | null> => {
  try {
    if (PERSISTENCE_CONFIG.FORCE_BROWSER) {
      const index = frameworks.findIndex(f => f.id === id);
      if (index === -1) {
        console.warn("Update framework: not found", id);
        return null;
      }
      const updated = { ...frameworks[index], ...data, updatedAt: new Date().toISOString() };
      frameworks = frameworks.map(f => (f.id === id ? updated : f));
      eventBus.publish("frameworksChanged");
      await saveFrameworksToBrowser();
      return updated;
    }

    const response = await fetch(`/api/frameworks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      if (response.status === 404) {
        console.error("Framework not found:", id);
        return null;
      }
      throw new Error(`Failed to update framework: ${response.statusText}`);
    }
    const updatedFramework = await response.json();
    frameworks = frameworks.map(f => (f.id === id ? updatedFramework : f));
    eventBus.publish("frameworksChanged");
    syncFrameworksToYjs();
    return updatedFramework;
  } catch (error) {
    console.error("Error updating framework:", error);
    return null;
  }
};

const deleteFramework = async (id: string): Promise<boolean> => {
  try {
    frameworks = frameworks.filter(f => f.id !== id);
    eventBus.publish("frameworksChanged");

    if (PERSISTENCE_CONFIG.FORCE_BROWSER) {
      await saveFrameworksToBrowser();
      return true;
    }

    const response = await fetch(`/api/frameworks/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(`Failed to delete framework: ${response.statusText}`);
    }
    syncFrameworksToYjs();
    return true;
  } catch (error) {
    console.error("Error deleting framework:", error);
    return false;
  }
};

if (typeof window !== 'undefined') {
  loadFrameworks();
}

export function useFrameworks(frameworkType?: FrameworkType) {
  const [, setForceRender] = React.useState({});
  const [frameworksVersion, setFrameworksVersion] = React.useState(0);

  React.useEffect(() => {
    initializeCollaboration();
  }, []);

  React.useEffect(() => {
    const onFrameworksChanged = () => {
      setForceRender({});
      setFrameworksVersion(v => v + 1);
    };
    eventBus.subscribe("frameworksChanged", onFrameworksChanged);
    return () => {
      eventBus.unsubscribe("frameworksChanged", onFrameworksChanged);
    };
  }, []);

  React.useEffect(() => {
    if (!isCollaborationEnabled()) return;

    const observer = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      frameworks = (Array.from(yFrameworks.values()) as any[]).map(v => {
        if (v && typeof v.toJSON === "function") return v.toJSON();
        return JSON.parse(JSON.stringify(v));
      }) as FrameworkEntity[];
      eventBus.publish("frameworksChanged");
    };

    yFrameworks.observe(observer);
    return () => {
      yFrameworks.unobserve(observer);
    };
  }, []);

  const filteredFrameworks = frameworkType
    ? frameworks.filter(f => f.frameworkType === frameworkType)
    : frameworks;

  return {
    frameworks: filteredFrameworks,
    frameworksVersion,
    loadFrameworks,
    createFramework,
    updateFramework,
    deleteFramework,
    getFrameworkById: React.useCallback((id: string): FrameworkEntity | undefined => {
      return frameworks.find(f => f.id === id);
    }, []),
  };
}