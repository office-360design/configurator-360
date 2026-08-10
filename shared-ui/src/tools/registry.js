const DEFAULT_PLACEMENT = Object.freeze({
  side: 'left',
  direction: 'down',
  offsetX: 12,
  offsetY: 12,
});

function freezeTool(tool) {
  return Object.freeze({
    configurable: true,
    ...tool,
    defaults: Object.freeze({ ...(tool.defaults ?? {}) }),
  });
}

/**
 * Shared tools are opt-in UI contracts, not automatically enabled features.
 * Each configurator developer selects the tools that make sense and supplies
 * the scene-specific behavior and placement overrides.
 */
const TOOL_ICONS = Object.freeze({
  environment: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>`,
  dimensions: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7v10M20 7v10M7 12h10"/><path d="m9 9-3 3 3 3M15 9l3 3-3 3"/></svg>`,
  compass: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m14.8 9.2-1.8 3.8-3.8 1.8 1.8-3.8 3.8-1.8Z"/><path d="M12 1.8v2.1M12 20.1v2.1"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><path d="m5.2 5.2 2.6 2.6M16.2 16.2l2.6 2.6M18.8 5.2l-2.6 2.6M7.8 16.2l-2.6 2.6"/></svg>`,
  technicalEdges: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12 12 3Z"/><path d="M7.8 12h8.4M12 7.8v8.4"/></svg>`,
  explode: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 6.5 3.5-2 3.5 2-3.5 2-3.5-2ZM4.5 12l3.5-2 3.5 2-3.5 2-3.5-2ZM12.5 12l3.5-2 3.5 2-3.5 2-3.5-2ZM8.5 17.5l3.5-2 3.5 2-3.5 2-3.5-2Z"/></svg>`,
});

export const SHARED_TOOL_DEFINITIONS = Object.freeze({
  environment: freezeTool({
    id: 'environment',
    action: 'toggle-environment',
    label: 'Light & orientation',
    icon: TOOL_ICONS.environment,
    defaults: { panelPlacement: 'near-launcher' },
  }),
  dimensions: freezeTool({
    id: 'dimensions',
    action: 'toggle-dimensions',
    label: 'Toggle dimensions',
    icon: TOOL_ICONS.dimensions,
    defaults: { visible: true },
  }),
  compass: freezeTool({
    id: 'compass',
    action: 'toggle-compass',
    label: 'Toggle compass',
    icon: TOOL_ICONS.compass,
    defaults: {
      visible: false,
      // Scene placement is deliberately supplied by each configurator.
      placement: null,
      heightOffset: 0,
      rotationOffset: 0,
      scale: 1,
    },
  }),
  camera: freezeTool({
    id: 'camera',
    action: 'cycle-camera',
    label: 'Change camera',
    icon: TOOL_ICONS.camera,
    defaults: { presets: [] },
  }),
  technicalEdges: freezeTool({
    id: 'technical-edges',
    action: 'toggle-technical-edges',
    label: 'Technical edges',
    icon: TOOL_ICONS.technicalEdges,
    defaults: { active: false },
  }),
  explode: freezeTool({
    id: 'explode',
    action: 'toggle-explode-tool',
    label: 'Exploded view',
    icon: TOOL_ICONS.explode,
    defaults: { amount: 0 },
  }),
});

export function resolveSharedTool(id, overrides = {}) {
  const definition = SHARED_TOOL_DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown shared tool: ${id}`);
  return {
    ...definition,
    ...overrides,
    config: {
      ...definition.defaults,
      ...(overrides.config ?? {}),
    },
  };
}

export function resolveSharedTools(requested = []) {
  return requested.map((entry) => {
    if (typeof entry === 'string') return resolveSharedTool(entry);
    return resolveSharedTool(entry.id, entry);
  });
}

export function normalizeToolsPlacement(placement = {}) {
  return {
    ...DEFAULT_PLACEMENT,
    ...placement,
  };
}
