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
export const SHARED_TOOL_DEFINITIONS = Object.freeze({
  environment: freezeTool({
    id: 'environment',
    action: 'toggle-environment',
    label: 'Sun and orientation',
    icon: '☀',
    defaults: { panelPlacement: 'near-launcher' },
  }),
  dimensions: freezeTool({
    id: 'dimensions',
    action: 'toggle-dimensions',
    label: 'Toggle dimensions',
    icon: '↔',
    defaults: { visible: true },
  }),
  compass: freezeTool({
    id: 'compass',
    action: 'toggle-compass',
    label: 'Toggle compass',
    icon: '🧭',
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
    icon: '⌖',
    defaults: { presets: [] },
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
